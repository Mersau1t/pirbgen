// Shared types and constants for PIRBGEN

export type TradeDirection = 'LONG' | 'SHORT';
export type GameStatus = 'IDLE' | 'GENERATING' | 'PLAYING' | 'WIN' | 'REKT';
export type Rarity = 'common' | 'rare' | 'legendary' | 'degen';

export interface DegenPosition {
  id: number;
  asset: string;
  ticker: string;
  feedId: string;
  direction: TradeDirection;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  rarity: Rarity;
}

export const RARITY_STYLES: Record<Rarity, { border: string; text: string; bg: string; label: string }> = {
  common: { border: 'border-muted-foreground/30', text: 'text-muted-foreground', bg: 'bg-muted/20', label: 'COMMON' },
  rare: { border: 'border-neon-green/50', text: 'text-neon-green', bg: 'bg-neon-green/10', label: 'RARE' },
  legendary: { border: 'border-neon-orange/50', text: 'text-neon-orange', bg: 'bg-neon-orange/10', label: 'LEGENDARY' },
  degen: { border: 'border-neon-purple/50', text: 'text-neon-purple', bg: 'bg-neon-purple/10', label: '☠ DEGEN ☠' },
};

export const RARITY_CONFIG = [
  { rarity: 'common' as const, weight: 40, leverageRange: [20, 50], slRange: [5, 10], rrRange: [2, 4] },
  { rarity: 'rare' as const, weight: 30, leverageRange: [50, 100], slRange: [5, 8], rrRange: [3, 8] },
  { rarity: 'legendary' as const, weight: 20, leverageRange: [100, 150], slRange: [4, 7], rrRange: [5, 12] },
  { rarity: 'degen' as const, weight: 10, leverageRange: [150, 200], slRange: [3, 6], rrRange: [8, 20] },
];

export function pickRarity() {
  const total = RARITY_CONFIG.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RARITY_CONFIG) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RARITY_CONFIG[0];
}

export function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function fmtPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return '$' + p.toFixed(3);
  if (abs >= 100) return '$' + p.toFixed(4);
  if (abs >= 1) return '$' + p.toFixed(5);
  if (abs >= 0.01) return '$' + p.toFixed(7);
  if (abs >= 0.0001) return '$' + p.toFixed(9);
  return '$' + p.toPrecision(6);
}

export function formatVolume(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}
