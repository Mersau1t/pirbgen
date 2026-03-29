// Daily Challenge — deterministic shared trade for all players each day

import { supabase } from '@/integrations/supabase/client';

const DAILY_KEY = 'pirbgen_daily';

// Seeded random from date string
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function hasDoneDaily(): boolean {
  return localStorage.getItem(DAILY_KEY) === getTodayKey();
}

export function markDailyDone() {
  localStorage.setItem(DAILY_KEY, getTodayKey());
}

export interface DailyChallengeParams {
  direction: 'LONG' | 'SHORT';
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  timerSeconds: number;
}

/** Generate deterministic daily params from today's date + a feed list */
export function getDailyParams(feedCount: number): { feedIndex: number; params: DailyChallengeParams } {
  const rng = seededRandom(getTodayKey());

  const feedIndex = Math.floor(rng() * feedCount);
  const direction = rng() > 0.5 ? 'LONG' as const : 'SHORT' as const;

  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
  const rarityIdx = Math.min(Math.floor(rng() * 5), 4);
  const rarity = rarities[rarityIdx];

  const leverageRanges: Record<string, [number, number]> = {
    common: [20, 55],
    uncommon: [56, 90],
    rare: [91, 130],
    epic: [131, 170],
    legendary: [171, 200],
  };
  const lr = leverageRanges[rarity];
  const leverage = Math.floor(rng() * (lr[1] - lr[0] + 1)) + lr[0];

  const sl = Math.floor(rng() * 5) + 4; // 4-8
  const rr = Math.floor(rng() * 8) + 3; // 3-10

  return {
    feedIndex,
    params: {
      direction,
      leverage,
      stopLoss: -sl,
      takeProfit: sl * rr,
      rarity,
      timerSeconds: 90,
    },
  };
}