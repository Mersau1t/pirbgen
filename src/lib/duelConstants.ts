import { SOLO_TOKENS } from './soloTokens';

export const DUEL_TOKENS = SOLO_TOKENS;
export const DUEL_TIMER_SECONDS = 60;
export const REROLL_TIMER_SECONDS = 15;
export const REMATCH_TIMEOUT_SECONDS = 15;

export const BEST_OF_OPTIONS = [1, 3] as const;
export type BestOf = (typeof BEST_OF_OPTIONS)[number];

export function pickDuelToken() {
  return DUEL_TOKENS[Math.floor(Math.random() * DUEL_TOKENS.length)];
}

export function pickTwoDifferentTokens() {
  const shuffled = [...DUEL_TOKENS].sort(() => Math.random() - 0.5);
  return { p1Token: shuffled[0], p2Token: shuffled[1] };
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const DUEL_RARITY_CONFIG = [
  { rarity: 'common' as const, weight: 30, leverageRange: [20, 55], slRange: [5, 10], rrRange: [2, 4] },
  { rarity: 'uncommon' as const, weight: 25, leverageRange: [56, 90], slRange: [5, 8], rrRange: [3, 6] },
  { rarity: 'rare' as const, weight: 22, leverageRange: [91, 130], slRange: [5, 8], rrRange: [3, 8] },
  { rarity: 'epic' as const, weight: 15, leverageRange: [131, 170], slRange: [4, 7], rrRange: [5, 12] },
  { rarity: 'legendary' as const, weight: 8, leverageRange: [171, 200], slRange: [3, 6], rrRange: [8, 20] },
];

export function pickDuelRarity() {
  const total = DUEL_RARITY_CONFIG.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of DUEL_RARITY_CONFIG) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return DUEL_RARITY_CONFIG[0];
}

export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function winsNeeded(bestOf: BestOf): number {
  return bestOf === 3 ? 2 : 1;
}