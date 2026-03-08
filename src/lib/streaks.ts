// Win streak system with localStorage persistence

const STREAK_KEY = 'pirbgen_streak';

export interface StreakData {
  current: number;
  best: number;
}

export function getStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { current: 0, best: 0 };
}

function saveStreak(data: StreakData) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

export function recordWin(): StreakData {
  const s = getStreak();
  s.current += 1;
  if (s.current > s.best) s.best = s.current;
  saveStreak(s);
  return s;
}

export function recordLoss(): StreakData {
  const s = getStreak();
  s.current = 0;
  saveStreak(s);
  return s;
}

/** Bonus multiplier based on streak: 1x base, +0.5x per win streak */
export function getStreakMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  return 1 + (streak - 1) * 0.5;
}
