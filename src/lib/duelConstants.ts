// Duel-mode constants: limited token pool + Pyth feed IDs

export const DUEL_TOKENS = [
  {
    ticker: 'BTC',
    pair: 'BTC/USD',
    feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
  {
    ticker: 'ETH',
    pair: 'ETH/USD',
    feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  },
  {
    ticker: 'SOL',
    pair: 'SOL/USD',
    feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  },
];

export const DUEL_TIMER_SECONDS = 60;

/** Pick a random token from the duel pool */
export function pickDuelToken() {
  return DUEL_TOKENS[Math.floor(Math.random() * DUEL_TOKENS.length)];
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
