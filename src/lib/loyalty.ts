// ── Loyalty program: points, tiers, redeemable rewards ──────────────────
const KEY = 'ba_loyalty_v1';

export interface LoyaltyEntry {
  ts: number;
  delta: number;
  reason: string;
}
export interface LoyaltyState {
  points: number; // spendable balance
  lifetime: number; // total ever earned (drives tier)
  history: LoyaltyEntry[];
  redeemed: string[]; // reward ids redeemed (active coupons)
}

export interface Tier {
  name: string;
  nameAr: string;
  min: number;
  emoji: string;
  color: string;
  perk: string;
  perkAr: string;
  mult: number; // points multiplier
}

export const TIERS: Tier[] = [
  { name: 'Bronze', nameAr: 'برونزي', min: 0, emoji: '🥉', color: '#C97B3C', perk: '1× points', perkAr: '١× نقاط', mult: 1 },
  { name: 'Silver', nameAr: 'فضي', min: 500, emoji: '🥈', color: '#8A97A6', perk: '1.1× points', perkAr: '١.١× نقاط', mult: 1.1 },
  { name: 'Gold', nameAr: 'ذهبي', min: 1500, emoji: '🥇', color: '#E8A21C', perk: '1.25× + priority', perkAr: '١.٢٥× + أولوية', mult: 1.25 },
  { name: 'Platinum', nameAr: 'بلاتيني', min: 4000, emoji: '💎', color: '#12B5C9', perk: '1.5× + free delivery', perkAr: '١.٥× + توصيل مجاني', mult: 1.5 },
];

export interface Reward {
  id: string;
  cost: number;
  emoji: string;
  title: string;
  titleAr: string;
  code: string; // coupon code unlocked (or perk tag)
  counter?: boolean; // shown at counter instead of checkout coupon
}

export const REWARDS: Reward[] = [
  { id: 'r5', cost: 100, emoji: '🎟️', title: 'SR 5 off', titleAr: 'خصم ٥ ريال', code: 'WELCOME5' },
  { id: 'r10', cost: 250, emoji: '🏷️', title: '10% off', titleAr: 'خصم ١٠٪', code: 'ALBAHR10' },
  { id: 'rdrink', cost: 350, emoji: '🥤', title: 'Free Drink', titleAr: 'مشروب مجاني', code: 'DRINK', counter: true },
  { id: 'r15', cost: 500, emoji: '💥', title: '15% off', titleAr: 'خصم ١٥٪', code: 'BROAST15' },
  { id: 'rfries', cost: 750, emoji: '🍟', title: 'Free Fries', titleAr: 'بطاطس مجانية', code: 'FRIES', counter: true },
];

function load(): LoyaltyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as LoyaltyState;
  } catch {}
  return { points: 0, lifetime: 0, history: [], redeemed: [] };
}
function save(s: LoyaltyState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export const loadLoyalty = load;

export function tierFor(lifetime: number): Tier {
  let t = TIERS[0];
  for (const x of TIERS) if (lifetime >= x.min) t = x;
  return t;
}
export function nextTier(lifetime: number): Tier | null {
  return TIERS.find((t) => t.min > lifetime) || null;
}
export function tierProgress(lifetime: number): number {
  const cur = tierFor(lifetime);
  const nxt = nextTier(lifetime);
  if (!nxt) return 1;
  return Math.min(1, (lifetime - cur.min) / (nxt.min - cur.min));
}

/** Award points (already tier-multiplied by caller if desired). */
export function addPoints(delta: number, reason: string): LoyaltyState {
  const s = load();
  const d = Math.max(0, Math.round(delta));
  s.points += d;
  s.lifetime += d;
  s.history.unshift({ ts: Date.now(), delta: d, reason });
  s.history = s.history.slice(0, 40);
  save(s);
  return s;
}

/** Points earned for an order total, boosted by current tier multiplier. */
export function pointsForOrder(total: number, lifetime: number): number {
  const mult = tierFor(lifetime).mult;
  return Math.round(total * mult); // 1 pt / SR × tier multiplier
}

export interface RedeemResult {
  ok: boolean;
  state: LoyaltyState;
  reward?: Reward;
}
export function redeem(rewardId: string): RedeemResult {
  const s = load();
  const reward = REWARDS.find((r) => r.id === rewardId);
  if (!reward || s.points < reward.cost) return { ok: false, state: s };
  s.points -= reward.cost;
  s.redeemed.unshift(reward.id);
  s.history.unshift({ ts: Date.now(), delta: -reward.cost, reason: `Redeemed ${reward.title}` });
  s.history = s.history.slice(0, 40);
  save(s);
  return { ok: true, state: s, reward };
}

export function _seedLoyalty(s: Partial<LoyaltyState>) {
  save({ points: 0, lifetime: 0, history: [], redeemed: [], ...s });
}
