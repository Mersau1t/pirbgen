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
import {
  PIRB_ENTROPY_ADDRESS,
  ENTROPY_CFG,
  deriveSeed,
  randFromDerived,
  mapContractRarity,
  calcRarityFromLeverage,
  type EntropyPosition,
  type Rarity,
} from './useEntropy';

// ── Duel-specific ABI entries ───────────────────────────────────────────────
const DUEL_ABI = [
  {
    name: 'getEntropyFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    name: 'createDuel',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'fullRandom', type: 'bool' },
      { name: 'chosenDirection', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    name: 'joinDuel',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'duelId', type: 'uint256' },
      { name: 'chosenDirection', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    name: 'getDuelInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'duelId', type: 'uint256' }],
    outputs: [
      { name: 'duelType', type: 'uint8' },
      { name: 'active', type: 'bool' },
      { name: 'finished', type: 'bool' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
  {
    name: 'getDuelPlayer1',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'duelId', type: 'uint256' }],
    outputs: [
      { name: 'addr', type: 'address' },
      { name: 'tokenIndex', type: 'uint8' },
      { name: 'direction', type: 'uint8' },
      { name: 'leverage', type: 'uint16' },
      { name: 'rarity', type: 'uint8' },
      { name: 'rerollsUsed', type: 'uint8' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    name: 'getDuelPlayer2',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'duelId', type: 'uint256' }],
    outputs: [
      { name: 'addr', type: 'address' },
      { name: 'tokenIndex', type: 'uint8' },
      { name: 'direction', type: 'uint8' },
      { name: 'leverage', type: 'uint16' },
      { name: 'rarity', type: 'uint8' },
      { name: 'rerollsUsed', type: 'uint8' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    name: 'nextDuelId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'DuelCreated',
    type: 'event',
    inputs: [
      { name: 'duelId', type: 'uint256', indexed: true },
      { name: 'player1', type: 'address', indexed: true },
      { name: 'duelType', type: 'uint8', indexed: false },
    ],
  },
  {
    name: 'DuelJoined',
    type: 'event',
    inputs: [
      { name: 'duelId', type: 'uint256', indexed: true },
      { name: 'player2', type: 'address', indexed: true },
    ],
  },
  {
    name: 'DuelPlayerResult',
    type: 'event',
    inputs: [
      { name: 'duelId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'tokenIndex', type: 'uint8', indexed: false },
      { name: 'direction', type: 'uint8', indexed: false },
      { name: 'leverage', type: 'uint16', indexed: false },
      { name: 'rarity', type: 'uint8', indexed: false },
    ],
  },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DUEL_ABI_M = DUEL_ABI as any;

// ── Types ───────────────────────────────────────────────────────────────────

export type DuelEntropyStatus =
  | 'idle'
  | 'creating'           // P1 tx pending
  | 'waiting_create'     // P1 waiting for Entropy callback
  | 'lobby'              // P1 ready, waiting for P2
  | 'joining'            // P2 tx pending
  | 'waiting_join'       // P2 waiting for Entropy callback
  | 'rerolling'          // Both have seeds — reroll phase
  | 'ready'              // Both confirmed, ready to play
  | 'error';

export interface UseDuelEntropyReturn {
  status: DuelEntropyStatus;
  duelId: bigint | null;
  player1: EntropyPosition | null;
  player2: EntropyPosition | null;
  fee: bigint | undefined;
  feeFormatted: string;
  isPlayer1: boolean;
  /** P1 creates a duel. fullRandom=true → direction randomized. */
  createDuel: (fullRandom: boolean, chosenDirection?: 0 | 1) => Promise<void>;
  /** P2 joins an existing duel. */
  joinDuel: (duelId: bigint, chosenDirection?: 0 | 1) => Promise<void>;
  /** Reroll a SINGLE parameter for the current player. */
  rerollSingle: (paramIndex: 1 | 2 | 3 | 4 | 5) => EntropyPosition | null;
  /** Reroll ALL parameters (full regeneration) for the current player. */
  rerollAll: () => EntropyPosition | null;
  reset: () => void;
  error: string | null;
  isCorrectChain: boolean;
  isFullRandom: boolean;
}

// ── Helper: build local seed for duel player ────────────────────────────────
// The duel contract provides seed per-player via Entropy callback.
// We derive a deterministic local seed from txHash + playerAddress for rerolls.
function buildDuelSeed(txHash: Hex, playerAddr: string): Hex {
  return keccak256(encodePacked(['bytes32', 'address'], [txHash, playerAddr as `0x${string}`]));
}

/**
 * Build a full EntropyPosition from on-chain duel data + derived SL/TP.
 * Contract gives us: tokenIndex, direction, leverage, rarity.
 * We derive SL, rrRatio, takeProfit from the seed locally.
 */
function buildDuelPosition(
  seed: Hex,
  nonce: number,
  tokenIndex: number,
  direction: 'LONG' | 'SHORT',
  leverage: number,
  rarity: Rarity,
  rerollsUsed: number = 0,
): EntropyPosition {
  // Derive SL and rrRatio from the seed — same logic as solo
  const d = deriveSeed(seed, nonce);
  const sl = randFromDerived(d, 'sl', ENTROPY_CFG.slMin, ENTROPY_CFG.slMax);
  const rr = randFromDerived(d, 'rr', ENTROPY_CFG.rrMin, ENTROPY_CFG.rrMax);

  return {
    seed,
    nonce,
    tokenIndex,
    direction,
    leverage,
    stopLoss: sl,
    rrRatio: rr,
    takeProfit: sl * rr,
    rarity,
    rerollsUsed,
    maxRerolls: ENTROPY_CFG.maxRerollsDuel,
  };
}

/**
 * Reroll a single duel parameter locally.
 * paramIndex: 1=token, 2=direction, 3=leverage, 4=stopLoss, 5=rrRatio
 * For PLAYER_CHOICE mode, direction (2) is locked.
 */
function rerollDuelSingle(
  pos: EntropyPosition,
  paramIndex: 1 | 2 | 3 | 4 | 5,
  isFullRandom: boolean,
): EntropyPosition {
  if (pos.rerollsUsed >= pos.maxRerolls) throw new Error('No rerolls left');
  if (paramIndex === 2 && !isFullRandom) throw new Error('Direction locked in PLAYER_CHOICE mode');

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
 */
function rerollDuelFull(pos: EntropyPosition): EntropyPosition {
  if (pos.rerollsUsed >= pos.maxRerolls) throw new Error('No rerolls left');

  const newNonce = pos.nonce + 1;
  const d = deriveSeed(pos.seed, newNonce);

  const tokenIndex = randFromDerived(d, 'token', 0, ENTROPY_CFG.tokenCount - 1);
  const dir = randFromDerived(d, 'dir', 0, 1);
  const leverage = randFromDerived(d, 'lev', ENTROPY_CFG.leverageMin, ENTROPY_CFG.leverageMax);
  const sl = randFromDerived(d, 'sl', ENTROPY_CFG.slMin, ENTROPY_CFG.slMax);
  const rr = randFromDerived(d, 'rr', ENTROPY_CFG.rrMin, ENTROPY_CFG.rrMax);

  return {
    seed: pos.seed,
    nonce: newNonce,
    tokenIndex,
    direction: dir === 0 ? 'LONG' : 'SHORT',
    leverage,
    stopLoss: sl,
    rrRatio: rr,
    takeProfit: sl * rr,
    rarity: calcRarityFromLeverage(leverage),
    rerollsUsed: pos.rerollsUsed + 1,
    maxRerolls: pos.maxRerolls,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  HOOK
// ════════════════════════════════════════════════════════════════════════════

export function useDuelEntropy(): UseDuelEntropyReturn {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<DuelEntropyStatus>('idle');
  const [duelId, setDuelId] = useState<bigint | null>(null);
  const [player1, setPlayer1] = useState<EntropyPosition | null>(null);
  const [player2, setPlayer2] = useState<EntropyPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined);
  const [isP1, setIsP1] = useState(true);
  const [isFullRandom, setIsFullRandom] = useState(true);

  const isCorrectChain = chainId === base.id;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Fee ─────────────────────────────────────────────────────────────────
  const { data: feeData } = useReadContract({
    address: PIRB_ENTROPY_ADDRESS,
    abi: DUEL_ABI_M,
    functionName: 'getEntropyFee',
    chainId: base.id,
  });
  const fee = feeData as bigint | undefined;
  const feeFormatted = fee ? `${(Number(fee) / 1e18).toFixed(6)} ETH` : '—';

  // ── Write ───────────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();
  const { data: receipt, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Tx confirmed → start polling
  useEffect(() => {
    if (!isConfirmed || !receipt) return;

    if (status === 'creating') {
      setStatus('waiting_create');
    } else if (status === 'joining') {
      setStatus('waiting_join');
    }
  }, [isConfirmed, receipt, status]);

  // ── Poll for duel player data ───────────────────────────────────────────
  useEffect(() => {
    if (!['waiting_create', 'waiting_join', 'lobby'].includes(status)) return;
    if (!publicClient || !address || duelId === null) return;

    let attempts = 0;
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

    const poll = async () => {
      attempts++;
      if (!mountedRef.current) return;

      try {
        const [p1Data, p2Data] = await Promise.all([
          publicClient.readContract({
            address: PIRB_ENTROPY_ADDRESS,
            abi: DUEL_ABI_M,
            functionName: 'getDuelPlayer1',
            args: [duelId],
          }) as any,
          publicClient.readContract({
            address: PIRB_ENTROPY_ADDRESS,
            abi: DUEL_ABI_M,
            functionName: 'getDuelPlayer2',
            args: [duelId],
          }) as any,
        ]);

        // getDuelPlayer: [addr, tokenIndex, direction, leverage, rarity, rerollsUsed, ready]
        const p1Addr = p1Data[0] as string;
        const p2Addr = p2Data[0] as string;
        const p1Leverage = Number(p1Data[3]);
        const p2Leverage = Number(p2Data[3]);

        const p1HasData = p1Leverage > 0;
        const p2HasData = p2Leverage > 0 && p2Addr !== ZERO_ADDR;

        if (status === 'waiting_create' && p1HasData) {
          const seed = txHash ? buildDuelSeed(txHash, p1Addr) : ('0x' + '00'.repeat(32)) as Hex;
          setPlayer1(buildDuelPosition(
            seed, 0,
            Math.min(Number(p1Data[1]), ENTROPY_CFG.tokenCount - 1),
            Number(p1Data[2]) === 0 ? 'LONG' : 'SHORT',
            p1Leverage,
            mapContractRarity(Number(p1Data[4])),
          ));
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('lobby');
          return;
        }

        if (status === 'waiting_join' && p2HasData) {
          const seed = txHash ? buildDuelSeed(txHash, p2Addr) : ('0x' + '00'.repeat(32)) as Hex;
          // Also refresh P1 data
          if (!player1) {
            const p1Seed = buildDuelSeed(txHash || ('0x' + '00'.repeat(32)) as Hex, p1Addr);
            setPlayer1(buildDuelPosition(
              p1Seed, 0,
              Math.min(Number(p1Data[1]), ENTROPY_CFG.tokenCount - 1),
              Number(p1Data[2]) === 0 ? 'LONG' : 'SHORT',
              p1Leverage,
              mapContractRarity(Number(p1Data[4])),
            ));
          }
          setPlayer2(buildDuelPosition(
            seed, 0,
            Math.min(Number(p2Data[1]), ENTROPY_CFG.tokenCount - 1),
            Number(p2Data[2]) === 0 ? 'LONG' : 'SHORT',
            p2Leverage,
            mapContractRarity(Number(p2Data[4])),
          ));
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('rerolling');
          return;
        }

        // In lobby, also poll for P2 joining
        if (status === 'lobby' && p2HasData) {
          const seed = buildDuelSeed(txHash || ('0x' + '00'.repeat(32)) as Hex, p2Addr);
          setPlayer2(buildDuelPosition(
            seed, 0,
            Math.min(Number(p2Data[1]), ENTROPY_CFG.tokenCount - 1),
            Number(p2Data[2]) === 0 ? 'LONG' : 'SHORT',
            p2Leverage,
            mapContractRarity(Number(p2Data[4])),
          ));
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('rerolling');
          return;
        }
      } catch (err) {
        console.warn('[useDuelEntropy] poll error:', err);
      }

      if (attempts >= 150) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError('Timeout waiting for duel data');
        setStatus('error');
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, publicClient, address, duelId, txHash, player1]);

  // ── createDuel ──────────────────────────────────────────────────────────
  const createDuel = useCallback(async (fullRandom: boolean, chosenDirection: 0 | 1 = 0) => {
    if (!address) { setError('Connect wallet first'); return; }
    if (!isCorrectChain) { setError('Switch to Base network'); return; }
    if (!fee) { setError('Fee not loaded'); return; }

    try {
      setStatus('creating');
      setError(null);
      setIsP1(true);
      setIsFullRandom(fullRandom);
      setPlayer1(null);
      setPlayer2(null);

      const nextId = await publicClient!.readContract({
        address: PIRB_ENTROPY_ADDRESS,
        abi: DUEL_ABI_M,
        functionName: 'nextDuelId',
      }) as bigint;
      setDuelId(nextId);

      const hash = await writeContractAsync({
        address: PIRB_ENTROPY_ADDRESS,
        abi: DUEL_ABI_M,
        functionName: 'createDuel',
        args: [fullRandom, chosenDirection],
        value: fee,
        chainId: base.id,
      });

      setTxHash(hash);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || 'createDuel failed');
      setStatus('error');
    }
  }, [address, isCorrectChain, fee, publicClient, writeContractAsync]);

  // ── joinDuel ────────────────────────────────────────────────────────────
  const joinDuel = useCallback(async (id: bigint, chosenDirection: 0 | 1 = 0) => {
    if (!address) { setError('Connect wallet first'); return; }
    if (!isCorrectChain) { setError('Switch to Base network'); return; }
    if (!fee) { setError('Fee not loaded'); return; }

    try {
      setStatus('joining');
      setError(null);
      setIsP1(false);
      setDuelId(id);

      const hash = await writeContractAsync({
        address: PIRB_ENTROPY_ADDRESS,
        abi: DUEL_ABI_M,
        functionName: 'joinDuel',
        args: [id, chosenDirection],
        value: fee,
        chainId: base.id,
      });

      setTxHash(hash);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || 'joinDuel failed');
      setStatus('error');
    }
  }, [address, isCorrectChain, fee, writeContractAsync]);

  // ── Reroll SINGLE param for current player ─────────────────────────────
  const rerollSingle = useCallback((paramIndex: 1 | 2 | 3 | 4 | 5): EntropyPosition | null => {
    const myPos = isP1 ? player1 : player2;
    if (!myPos || myPos.rerollsUsed >= myPos.maxRerolls) return null;

    try {
      const updated = rerollDuelSingle(myPos, paramIndex, isFullRandom);
      if (isP1) setPlayer1(updated);
      else setPlayer2(updated);
      return updated;
    } catch {
      return null;
    }
  }, [isP1, player1, player2, isFullRandom]);

  // ── Reroll ALL params for current player ───────────────────────────────
  const rerollAll = useCallback((): EntropyPosition | null => {
    const myPos = isP1 ? player1 : player2;
    if (!myPos || myPos.rerollsUsed >= myPos.maxRerolls) return null;

    try {
      const updated = rerollDuelFull(myPos);
      if (isP1) setPlayer1(updated);
      else setPlayer2(updated);
      return updated;
    } catch {
      return null;
    }
  }, [isP1, player1, player2]);

  // ── Reset ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus('idle');
    setDuelId(null);
    setPlayer1(null);
    setPlayer2(null);
    setError(null);
    setTxHash(undefined);
  }, []);

  return {
    status,
    duelId,
    player1,
    player2,
    fee,
    feeFormatted,
    isPlayer1: isP1,
    createDuel,
    joinDuel,
    rerollSingle,
    rerollAll,
    reset,
    error,
    isCorrectChain,
    isFullRandom,
  };
}