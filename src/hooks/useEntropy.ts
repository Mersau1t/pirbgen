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

// Cast for wagmi hooks (avoids readonly/authorizationList type conflicts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PIRB_ABI = PIRB_ENTROPY_ABI as any;

// ════════════════════════════════════════════════════════════════════════════
//  PURE HELPERS — exported for PirbTerminal, Duel, etc.
// ════════════════════════════════════════════════════════════════════════════

/** 5-level rarity matching the smart contract enum */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Map contract enum (0–4) → frontend rarity string */
export function mapContractRarity(r: number): Rarity {
  switch (r) {
    case 0: return 'common';
    case 1: return 'uncommon';
    case 2: return 'rare';
    case 3: return 'epic';
    case 4: return 'legendary';
    default: return 'common';
  }
}

/** Calculate rarity from leverage — mirrors contract _calcRarity exactly */
export function calcRarityFromLeverage(lev: number): Rarity {
  if (lev <= 55) return 'common';
  if (lev <= 90) return 'uncommon';
  if (lev <= 130) return 'rare';
  if (lev <= 170) return 'epic';
  return 'legendary';
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

// ── Config — matches contract defaults ──────────────────────────────────────
export const ENTROPY_CFG = {
  tokenCount: 17,
  leverageMin: 20,
  leverageMax: 200,
  slMin: 3,
  slMax: 10,
  rrMin: 2,
  rrMax: 20,
  maxRerollsSolo: 3,
  maxRerollsDuel: 5,
};

/** @deprecated — use ENTROPY_CFG */
export const CFG = ENTROPY_CFG;

// ── Unified position type (used by solo + duel) ─────────────────────────────
export interface EntropyPosition {
  seed: Hex;
  nonce: number;
  tokenIndex: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  stopLoss: number;
  rrRatio: number;
  takeProfit: number;
  rarity: Rarity;
  rerollsUsed: number;
  maxRerolls: number;
}

/** @deprecated — use EntropyPosition */
export type EntropySeed = EntropyPosition;

/**
 * Derive a full position from seed + nonce.
 * nonce=0 → original contract position.
 * Each nonce gives a completely different position (all params regenerated).
 */
export function derivePosition(
  seed: Hex,
  nonce: number,
  lockToken?: number,
  lockLeverage?: number,
  maxRerolls: number = ENTROPY_CFG.maxRerollsSolo,
  rerollsUsed: number = 0,
): EntropyPosition {
  const d = deriveSeed(seed, nonce);
  const tokenIndex = lockToken != null ? lockToken : randFromDerived(d, 'token', 0, ENTROPY_CFG.tokenCount - 1);
  const dir = randFromDerived(d, 'dir', 0, 1);
  const leverage = lockLeverage != null ? lockLeverage : randFromDerived(d, 'lev', ENTROPY_CFG.leverageMin, ENTROPY_CFG.leverageMax);
  const sl = randFromDerived(d, 'sl', ENTROPY_CFG.slMin, ENTROPY_CFG.slMax);
  const rr = randFromDerived(d, 'rr', ENTROPY_CFG.rrMin, ENTROPY_CFG.rrMax);
  return {
    seed,
    nonce,
    tokenIndex,
    direction: dir === 0 ? 'LONG' : 'SHORT',
    leverage,
    stopLoss: sl,
    rrRatio: rr,
    takeProfit: sl * rr,
    rarity: lockLeverage != null ? 'legendary' : calcRarityFromLeverage(leverage),
    rerollsUsed,
    maxRerolls,
  };
}

/**
 * Reroll a SINGLE parameter. The rest stays the same.
 * paramIndex: 1=token, 2=direction, 3=leverage, 4=stopLoss, 5=rrRatio
 */
export function rerollSingleParam(
  pos: EntropyPosition,
  paramIndex: 1 | 2 | 3 | 4 | 5,
  lockToken?: number,
  lockLeverage?: number,
): EntropyPosition {
  if (pos.rerollsUsed >= pos.maxRerolls) throw new Error('No rerolls left');
  if (lockToken != null && paramIndex === 1) throw new Error('Token is locked');
  if (lockLeverage != null && paramIndex === 3) throw new Error('Leverage is locked');

  const newNonce = pos.nonce + 1;
  const derived = deriveSeed(pos.seed, newNonce);
  const updated: EntropyPosition = {
    ...pos,
    nonce: newNonce,
    rerollsUsed: pos.rerollsUsed + 1,
  };

  switch (paramIndex) {
    case 1:
      updated.tokenIndex = randFromDerived(derived, 'r', 0, ENTROPY_CFG.tokenCount - 1);
      break;
    case 2:
      updated.direction = randFromDerived(derived, 'r', 0, 1) === 0 ? 'LONG' : 'SHORT';
      break;
    case 3:
      updated.leverage = randFromDerived(derived, 'r', ENTROPY_CFG.leverageMin, ENTROPY_CFG.leverageMax);
      updated.rarity = calcRarityFromLeverage(updated.leverage);
      break;
    case 4:
      updated.stopLoss = randFromDerived(derived, 'r', ENTROPY_CFG.slMin, ENTROPY_CFG.slMax);
      updated.takeProfit = updated.stopLoss * updated.rrRatio;
      break;
    case 5:
      updated.rrRatio = randFromDerived(derived, 'r', ENTROPY_CFG.rrMin, ENTROPY_CFG.rrMax);
      updated.takeProfit = updated.stopLoss * updated.rrRatio;
      break;
  }

  return updated;
}

/**
 * Reroll ALL parameters at once (full regeneration).
 * Used for post-game rerolls and duel "reroll all" button.
 */
export function rerollFullPosition(
  pos: EntropyPosition,
  lockToken?: number,
  lockLeverage?: number,
): EntropyPosition {
  if (pos.rerollsUsed >= pos.maxRerolls) throw new Error('No rerolls left');

  const newNonce = pos.nonce + 1;
  return derivePosition(
    pos.seed,
    newNonce,
    lockToken,
    lockLeverage,
    pos.maxRerolls,
    pos.rerollsUsed + 1,
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  HOOK
// ════════════════════════════════════════════════════════════════════════════

export type EntropyStatus = 'idle' | 'requesting' | 'waiting_callback' | 'ready' | 'error';

export interface UseEntropyReturn {
  status: EntropyStatus;
  seed: Hex | null;
  initialPosition: EntropyPosition | null;
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
  const [initialPosition, setInitialPosition] = useState<EntropyPosition | null>(null);
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
    address: PIRB_ENTROPY_ADDRESS, abi: PIRB_ABI,
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
          address: PIRB_ENTROPY_ADDRESS, abi: PIRB_ABI,
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

        const tokenIndex = Math.min(Number(r[2]), ENTROPY_CFG.tokenCount - 1);
        const pos: EntropyPosition = {
          seed: s,
          nonce: 0,
          tokenIndex,
          direction: Number(r[3]) === 0 ? 'LONG' : 'SHORT',
          leverage: Number(r[4]),
          stopLoss: Number(r[5]),
          rrRatio: Number(r[6]),
          takeProfit: Number(r[7]),
          rarity: mapContractRarity(Number(r[8])),
          rerollsUsed: 0,
          maxRerolls: ENTROPY_CFG.maxRerollsSolo,
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
        address: PIRB_ENTROPY_ADDRESS, abi: PIRB_ABI,
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