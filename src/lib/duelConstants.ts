// Duel-mode constants: full token pool (same as solo) + Pyth feed IDs

import { SOLO_TOKENS } from './soloTokens';

// Duel uses the same token pool as solo
export const DUEL_TOKENS = SOLO_TOKENS;

export const DUEL_TIMER_SECONDS = 60;

/** Pick a random token from the duel pool */
export function pickDuelToken() {
  return DUEL_TOKENS[Math.floor(Math.random() * DUEL_TOKENS.length)];
}

/** Pick two DIFFERENT random tokens for PvP */
export function pickTwoDifferentTokens() {
  const shuffled = [...DUEL_TOKENS].sort(() => Math.random() - 0.5);
  return { p1Token: shuffled[0], p2Token: shuffled[1] };
}

/** Generate a 6-character room code */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Rarity config (same as PirbTerminal but exported)
export const DUEL_RARITY_CONFIG = [
  { rarity: 'common' as const, weight: 40, leverageRange: [20, 50], slRange: [5, 10], rrRange: [2, 4] },
  { rarity: 'rare' as const, weight: 30, leverageRange: [50, 100], slRange: [5, 8], rrRange: [3, 8] },
  { rarity: 'legendary' as const, weight: 20, leverageRange: [100, 150], slRange: [4, 7], rrRange: [5, 12] },
  { rarity: 'degen' as const, weight: 10, leverageRange: [150, 200], slRange: [3, 6], rrRange: [8, 20] },
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