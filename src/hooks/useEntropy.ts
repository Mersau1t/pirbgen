import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
} from 'wagmi';
import { keccak256, encodePacked, type Hex } from 'viem';
import { base } from 'wagmi/chains';

// ── Contract ────────────────────────────────────────────────────────────────
export const PIRB_ENTROPY_ADDRESS = '0xe44C1FFA3C7f2c646Acf9C3E2C00eAe04870Cfb1' as const;
const ZERO_SEED = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

export const PIRB_ENTROPY_ABI = [
  {
    name: 'getEntropyFee', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint128' }],
  },
  {
    name: 'soloStates', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'seed', type: 'bytes32' },
      { name: 'nonce', type: 'uint8' },
      { name: 'tokenIndex', type: 'uint8' },
      { name: 'direction', type: 'uint8' },
      { name: 'leverage', type: 'uint16' },
      { name: 'stopLoss', type: 'uint8' },
      { name: 'rrRatio', type: 'uint8' },
      { name: 'takeProfit', type: 'uint16' },
      { name: 'rarity', type: 'uint8' },
      { name: 'rerollsUsed', type: 'uint8' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    name: 'requestSolo', type: 'function', stateMutability: 'payable',
    inputs: [], outputs: [],
  },
] as const;

// ════════════════════════════════════════════════════════════════════════════
//  PURE HELPERS — exported for use in PirbTerminal
// ════════════════════════════════════════════════════════════════════════════

export function mapContractRarity(r: number): 'common' | 'rare' | 'legendary' | 'degen' {
  if (r <= 1) return 'common';
  if (r === 2) return 'rare';
  if (r === 3) return 'legendary';
  return 'degen';
}

export function calcRarityFromLeverage(lev: number): 'common' | 'rare' | 'legendary' | 'degen' {
  if (lev <= 55) return 'common';
  if (lev <= 90) return 'common';
  if (lev <= 130) return 'rare';
  if (lev <= 170) return 'legendary';
  return 'degen';
}

/** Mirrors contract _derive: keccak256(abi.encodePacked(seed, uint256(nonce))) */
export function deriveSeed(seed: Hex, nonce: number): Hex {
  return keccak256(encodePacked(['bytes32', 'uint256'], [seed, BigInt(nonce)]));
}

/** Mirrors contract _randU8/_randU16 */
export function randFromDerived(derived: Hex, label: string, min: number, max: number): number {
  const hash = keccak256(encodePacked(['bytes32', 'string'], [derived, label]));
  return min + Number(BigInt(hash) % BigInt(max - min + 1));
}

export const CFG = {
  tokenCount: 17,
  leverageMin: 20, leverageMax: 200,
  slMin: 3, slMax: 10,
  rrMin: 2, rrMax: 20,
  maxRerolls: 3,
};

// ── Seed data from contract ─────────────────────────────────────────────────
export interface EntropySeed {
  seed: Hex;
  tokenIndex: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  stopLoss: number;
  rrRatio: number;
  takeProfit: number;
  rarity: 'common' | 'rare' | 'legendary' | 'degen';
}

/**
 * Derive a full position from seed + nonce.
 * nonce=0 is the original position from the contract.
 * nonce=1,2,3 are the rerolls — each gives a completely new position.
 */
export function derivePosition(seed: Hex, nonce: number, lockToken?: number, lockLeverage?: number): EntropySeed {
  const d = deriveSeed(seed, nonce);
  const tokenIndex = lockToken != null ? lockToken : randFromDerived(d, 'token', 0, CFG.tokenCount - 1);
  const dir = randFromDerived(d, 'dir', 0, 1);
  const leverage = lockLeverage != null ? lockLeverage : randFromDerived(d, 'lev', CFG.leverageMin, CFG.leverageMax);
  const sl = randFromDerived(d, 'sl', CFG.slMin, CFG.slMax);
  const rr = randFromDerived(d, 'rr', CFG.rrMin, CFG.rrMax);
  return {
    seed,
    tokenIndex,
    direction: dir === 0 ? 'LONG' : 'SHORT',
    leverage,
    stopLoss: sl,
    rrRatio: rr,
    takeProfit: sl * rr,
    rarity: lockLeverage != null ? 'degen' : calcRarityFromLeverage(leverage),
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  HOOK
// ════════════════════════════════════════════════════════════════════════════

export type EntropyStatus = 'idle' | 'requesting' | 'waiting_callback' | 'ready' | 'error';

export interface UseEntropyReturn {
  status: EntropyStatus;
  /** The raw seed from contract (set once callback arrives). Used by PirbTerminal to derive positions. */
  seed: Hex | null;
  /** The initial position from the contract (nonce=0 equivalent) */
  initialPosition: EntropySeed | null;
  fee: bigint | undefined;
  feeFormatted: string;
  requestSolo: () => Promise<void>;
  reset: () => void;
  error: string | null;
  isCorrectChain: boolean;
}

export function useEntropy(): UseEntropyReturn {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<EntropyStatus>('idle');
  const [seed, setSeed] = useState<Hex | null>(null);
  const [initialPosition, setInitialPosition] = useState<EntropySeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined);

  const isCorrectChain = chainId === base.id;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── Fee ──────────────────────────────────────────────────────────────────
  const { data: feeData } = useReadContract({
    address: PIRB_ENTROPY_ADDRESS, abi: PIRB_ENTROPY_ABI,
    functionName: 'getEntropyFee', chainId: base.id,
  });
  const fee = feeData as bigint | undefined;
  const feeFormatted = fee ? `${(Number(fee) / 1e18).toFixed(6)} ETH` : '—';

  // ── Write ───────────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();
  const { data: receipt, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed && receipt && status === 'requesting') {
      setStatus('waiting_callback');
    }
  }, [isConfirmed, receipt, status]);

  // ── Poll soloStates for seed ────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'waiting_callback' || !publicClient || !address) return;

    let attempts = 0;
    const poll = async () => {
      attempts++;
      if (!mountedRef.current) return;
      try {
        const r = await publicClient.readContract({
          address: PIRB_ENTROPY_ADDRESS, abi: PIRB_ENTROPY_ABI,
          functionName: 'soloStates', args: [address],
        }) as any[];

        const s = r[0] as Hex;
        const active = r[10] as boolean;

        if (!active || s === ZERO_SEED) {
          if (attempts >= 150) {
            if (pollRef.current) clearInterval(pollRef.current);
            setError('Timeout — Pyth callback not received. Try again.');
            setStatus('error');
          }
          return;
        }

        if (pollRef.current) clearInterval(pollRef.current);
        if (!mountedRef.current) return;

        const tokenIndex = Math.min(Number(r[2]), CFG.tokenCount - 1);
        const pos: EntropySeed = {
          seed: s, tokenIndex,
          direction: Number(r[3]) === 0 ? 'LONG' : 'SHORT',
          leverage: Number(r[4]),
          stopLoss: Number(r[5]),
          rrRatio: Number(r[6]),
          takeProfit: Number(r[7]),
          rarity: mapContractRarity(Number(r[8])),
        };

        setSeed(s);
        setInitialPosition(pos);
        setStatus('ready');
        setError(null);
      } catch {
        if (attempts >= 150) {
          if (pollRef.current) clearInterval(pollRef.current);
          setError('Failed to read contract'); setStatus('error');
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, publicClient, address]);

  // ── requestSolo ─────────────────────────────────────────────────────────
  const requestSolo = useCallback(async () => {
    if (!address) { setError('Connect wallet first'); return; }
    if (!isCorrectChain) { setError('Switch to Base network'); return; }
    if (!fee) { setError('Could not fetch entropy fee'); return; }
    try {
      setStatus('requesting'); setError(null); setSeed(null); setInitialPosition(null);
      const hash = await writeContractAsync({
        address: PIRB_ENTROPY_ADDRESS, abi: PIRB_ENTROPY_ABI,
        functionName: 'requestSolo', value: fee, chainId: base.id,
      });
      setTxHash(hash);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || 'Transaction failed');
      setStatus('error');
    }
  }, [address, isCorrectChain, fee, writeContractAsync]);

  // ── Reset ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus('idle'); setSeed(null); setInitialPosition(null);
    setError(null); setTxHash(undefined);
  }, []);

  return { status, seed, initialPosition, fee, feeFormatted, requestSolo, reset, error, isCorrectChain };
}
