// ── Daily visit streak (Snapchat-style 🔥) ──────────────────────────────
// A streak grows by one each consecutive day the customer opens the app.
// Miss a day and it resets. Hitting a milestone unlocks a coupon reward.

const KEY = 'ba_streak_v1';

export interface StreakState {
  count: number;
  best: number;
  lastDay: string; // YYYY-MM-DD (local)
  total: number; // total active days ever
}

export interface StreakTick {
  state: StreakState;
  changed: boolean; // first open of a new day
  increased: boolean; // streak went up
  reset: boolean; // a gap broke the streak
  milestone: Milestone | null;
}

export interface Milestone {
  days: number;
  code: string;
  label: string;
  emoji: string;
}

export const MILESTONES: Milestone[] = [
  { days: 3, code: 'WELCOME5', label: 'SR 5 off', emoji: '🎁' },
  { days: 7, code: 'ALBAHR10', label: '10% off', emoji: '⭐' },
  { days: 14, code: 'BROAST15', label: '15% off', emoji: '👑' },
  { days: 30, code: 'ALBAHR10', label: '10% off + VIP', emoji: '💎' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

function load(): StreakState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StreakState) : null;
  } catch {
    return null;
  }
}

function save(s: StreakState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function loadStreak(): StreakState {
  return load() || { count: 0, best: 0, lastDay: '', total: 0 };
}

/** Call once on app open. Advances / resets the streak for today. */
export function tickStreak(now = new Date()): StreakTick {
  const today = dayStr(now);
  const prev = load();

  // first ever
  if (!prev || !prev.lastDay) {
    const state: StreakState = { count: 1, best: 1, lastDay: today, total: 1 };
    save(state);
    return { state, changed: true, increased: true, reset: false, milestone: milestoneFor(1) };
  }

  // already counted today
  if (prev.lastDay === today) {
    return { state: prev, changed: false, increased: false, reset: false, milestone: null };
  }

  const gap = daysBetween(prev.lastDay, today);
  let count: number;
  let reset = false;
  if (gap === 1) {
    count = prev.count + 1;
  } else {
    count = 1;
    reset = prev.count > 1;
  }
  const state: StreakState = {
    count,
    best: Math.max(prev.best || 0, count),
    lastDay: today,
    total: (prev.total || 0) + 1,
  };
  save(state);
  return {
    state,
    changed: true,
    increased: count > prev.count,
    reset,
    milestone: count > prev.count ? milestoneFor(count) : null,
  };
}

export function milestoneFor(days: number): Milestone | null {
  return MILESTONES.find((m) => m.days === days) || null;
}

export function nextMilestone(count: number): Milestone | null {
  return MILESTONES.find((m) => m.days > count) || null;
}

/** Booleans for the last 7 days ending today; lit = part of the current streak. */
export function weekFlames(count: number): boolean[] {
  const lit = Math.min(count, 7);
  return Array.from({ length: 7 }, (_, i) => i >= 7 - lit);
}

/** TEST/DEV: seed a prior state so the next tick can be exercised. */
export function _seed(state: StreakState) {
  save(state);
}
