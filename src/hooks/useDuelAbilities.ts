/**
 * useDuelAbilities — Duel power-up system via Supabase Broadcast.
 * No DB columns needed. All state is local + synced via WebSocket.
 *
 * ABILITIES (6 total):
 * ═══ FOR SELF (buffs) ═══
 * 1. Pyth Core     — Reset your feed to Pyth Hermes (counters Chainlink/Redstone)
 * 2. Swap Self Dir — Flip your LONG↔SHORT, inverts your PnL
 *
 * ═══ AGAINST OPPONENT (debuffs) ═══
 * 3. Chainlink     — Switch opponent's feed to Chainlink API
 * 4. Redstone      — Switch opponent's feed to Redstone API
 * 5. Swap Opp Dir  — Flip opponent's LONG↔SHORT, inverts their PnL
 * 6. Pirb Rage     — 5s visual spam + opponent can't close position
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type OracleSource } from '@/lib/oracleFetchers';

// ── Types ───────────────────────────────────────────────────────────

export type AbilityId =
  | 'pyth_core'      // self: reset feed
  | 'swap_self_dir'  // self: flip own direction
  | 'chainlink'      // opponent: switch their feed
  | 'redstone'       // opponent: switch their feed
  | 'swap_opp_dir'   // opponent: flip their direction
  | 'pirb_rage';     // opponent: 5s visual + block close

export interface AbilityDef {
  id: AbilityId;
  name: string;
  icon: string;
  target: 'self' | 'opponent';
  description: string;
}

export const ABILITY_DEFS: AbilityDef[] = [
  // Self buffs
  { id: 'pyth_core', name: 'PYTH CORE', icon: '🔮', target: 'self', description: 'Reset feed to Pyth' },
  { id: 'swap_self_dir', name: 'FLIP SELF', icon: '🔄', target: 'self', description: 'Swap your LONG↔SHORT' },
  // Opponent debuffs
  { id: 'chainlink', name: 'CHAINLINK', icon: '⛓️', target: 'opponent', description: 'Switch opp feed' },
  { id: 'redstone', name: 'REDSTONE', icon: '🔴', target: 'opponent', description: 'Switch opp feed' },
  { id: 'swap_opp_dir', name: 'FLIP OPP', icon: '↕️', target: 'opponent', description: 'Swap opp LONG↔SHORT' },
  { id: 'pirb_rage', name: 'PIRB RAGE', icon: '💩', target: 'opponent', description: '5s blind + block' },
];

export const SELF_ABILITIES = ABILITY_DEFS.filter(a => a.target === 'self');
export const OPP_ABILITIES = ABILITY_DEFS.filter(a => a.target === 'opponent');

export const PIRB_RAGE_DURATION = 5000; // 5 seconds

// ── Active effects on a player ──────────────────────────────────────

export interface PlayerEffects {
  /** Current price feed source */
  feedSource: OracleSource;
  /** Is direction flipped from original? */
  directionFlipped: boolean;
  /** Is currently blinded by Pirb Rage? */
  pirbRageActive: boolean;
  /** Pirb Rage end timestamp */
  pirbRageUntil: number;
  /** Is price frozen (oracle doesn't support this token)? */
  priceFrozen: boolean;
  /** Frozen reason */
  frozenReason: string | null;
}

const DEFAULT_EFFECTS: PlayerEffects = {
  feedSource: 'pyth',
  directionFlipped: false,
  pirbRageActive: false,
  pirbRageUntil: 0,
  priceFrozen: false,
  frozenReason: null,
};

// ── Incoming effect event (what opponent applied on you) ────────────

export interface AbilityEvent {
  abilityId: AbilityId;
  from: 'p1' | 'p2';
  timestamp: number;
}

// ── Hook return ─────────────────────────────────────────────────────

export interface UseDuelAbilitiesReturn {
  /** Effects applied to ME */
  myEffects: PlayerEffects;
  /** Set of abilities I've already used */
  usedAbilities: Set<AbilityId>;
  /** Use an ability */
  useAbility: (abilityId: AbilityId) => void;
  /** Whether a specific ability can still be used */
  canUse: (abilityId: AbilityId) => boolean;
  /** Latest ability event received (for visual effects) */
  lastReceivedEvent: AbilityEvent | null;
  /** Clear last received event after animation plays */
  clearLastEvent: () => void;
  /** Whether abilities mode is enabled */
  enabled: boolean;
}

// ════════════════════════════════════════════════════════════════════
//  HOOK
// ════════════════════════════════════════════════════════════════════

export function useDuelAbilities(
  roomId: string,
  playerSlot: 'p1' | 'p2',
  ticker: string,
  enabled: boolean = false,
): UseDuelAbilitiesReturn {
  const [myEffects, setMyEffects] = useState<PlayerEffects>({ ...DEFAULT_EFFECTS });
  const [usedAbilities, setUsedAbilities] = useState<Set<AbilityId>>(new Set());
  const [lastReceivedEvent, setLastReceivedEvent] = useState<AbilityEvent | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pirbRageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Setup broadcast channel ───────────────────────────────────────
  useEffect(() => {
    if (!enabled || !roomId) return;

    const channel = supabase.channel(`duel-abilities-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'ability_used' }, (payload) => {
        const { abilityId, from } = payload.payload as { abilityId: AbilityId; from: string };
        // Only process abilities from OPPONENT
        if (from === playerSlot) return;

        const event: AbilityEvent = { abilityId, from: from as 'p1' | 'p2', timestamp: Date.now() };
        setLastReceivedEvent(event);

        // Apply effect to ME (I'm the target)
        applyIncomingAbility(abilityId);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (pirbRageTimerRef.current) clearTimeout(pirbRageTimerRef.current);
    };
  }, [enabled, roomId, playerSlot]);

  // ── Apply incoming ability (opponent used on me) ──────────────────
  const applyIncomingAbility = useCallback((abilityId: AbilityId) => {
    switch (abilityId) {
      case 'chainlink':
        setMyEffects(prev => {
          const hasToken = !['PYTHOIL'].includes(ticker.toUpperCase());
          return {
            ...prev,
            feedSource: 'chainlink',
            priceFrozen: !hasToken,
            frozenReason: !hasToken ? 'Sorry, this token is exclusively on Pyth!' : null,
          };
        });
        break;

      case 'redstone':
        setMyEffects(prev => {
          const hasToken = !['PYTHOIL'].includes(ticker.toUpperCase());
          return {
            ...prev,
            feedSource: 'redstone',
            priceFrozen: !hasToken,
            frozenReason: !hasToken ? 'Sorry, this token is exclusively on Pyth!' : null,
          };
        });
        break;

      case 'swap_opp_dir':
        setMyEffects(prev => ({
          ...prev,
          directionFlipped: !prev.directionFlipped,
        }));
        break;

      case 'pirb_rage':
        setMyEffects(prev => ({
          ...prev,
          pirbRageActive: true,
          pirbRageUntil: Date.now() + PIRB_RAGE_DURATION,
        }));
        // Auto-clear after 5s
        if (pirbRageTimerRef.current) clearTimeout(pirbRageTimerRef.current);
        pirbRageTimerRef.current = setTimeout(() => {
          setMyEffects(prev => ({
            ...prev,
            pirbRageActive: false,
          }));
        }, PIRB_RAGE_DURATION);
        break;

      default:
        break;
    }
  }, [ticker]);

  // ── Use an ability (I'm using on self or broadcasting to opponent) ─
  const useAbility = useCallback((abilityId: AbilityId) => {
    if (!enabled || usedAbilities.has(abilityId)) return;

    const def = ABILITY_DEFS.find(a => a.id === abilityId);
    if (!def) return;

    // Mark as used
    setUsedAbilities(prev => new Set(prev).add(abilityId));

    if (def.target === 'self') {
      // Apply to myself locally
      switch (abilityId) {
        case 'pyth_core':
          // Counter: reset feed to Pyth, remove freeze
          setMyEffects(prev => ({
            ...prev,
            feedSource: 'pyth',
            priceFrozen: false,
            frozenReason: null,
          }));
          break;

        case 'swap_self_dir':
          setMyEffects(prev => ({
            ...prev,
            directionFlipped: !prev.directionFlipped,
          }));
          break;
      }
    } else {
      // Broadcast to opponent
      channelRef.current?.send({
        type: 'broadcast',
        event: 'ability_used',
        payload: { abilityId, from: playerSlot },
      });
    }
  }, [enabled, usedAbilities, playerSlot]);

  // ── Can use check ─────────────────────────────────────────────────
  const canUse = useCallback((abilityId: AbilityId): boolean => {
    if (!enabled) return false;
    return !usedAbilities.has(abilityId);
  }, [enabled, usedAbilities]);

  const clearLastEvent = useCallback(() => {
    setLastReceivedEvent(null);
  }, []);

  return {
    myEffects,
    usedAbilities,
    useAbility,
    canUse,
    lastReceivedEvent,
    clearLastEvent,
    enabled,
  };
}
