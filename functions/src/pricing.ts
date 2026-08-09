/**
 * Al Bahr pricing engine — Phase 6.
 *
 * Everything here is pure, deterministic, and works in integer minor units
 * (halalas — 1 SAR = 100 halalas). Callers pass SAR floats and get SAR floats
 * back; the halala conversion is done at the boundary so JS float error never
 * accumulates through a sum.
 *
 * Concepts:
 *   • `menuPrice`  = the standard restaurant menu price (what someone would
 *                    pay at the counter).
 *   • `appPrice`   = the app selling price (may equal menuPrice; may be
 *                    intentionally lower for an "app-only" price).
 *   • `discount`   = an order-level discount (coupon or promo). Distributed
 *                    proportionally across the lines.
 *   • `reward`     = reserved for Phase 10/11 — always 0 for now, but the
 *                    fields are stamped so downstream schemas don't drift.
 *   • VAT is inclusive: the price the customer sees already contains the
 *     15% tax slice, so `vat = base × 15 / 115`.
 *
 * A line snapshot preserves BOTH menu and app price at the moment of order
 * so a later menu edit cannot change the historical numbers.
 */

export const VAT_RATE = 0.15;

/** Convert SAR (float) to halalas (int). Rounds half-away-from-zero. */
export function toMinor(sar: number): number {
  if (!Number.isFinite(sar)) return 0;
  return Math.round(sar * 100);
}

/** Convert halalas (int) back to SAR with 2-decimal display. */
export function fromMinor(hal: number): number {
  return Math.round(hal) / 100;
}

/** Tiered platform fee on a SAR subtotal — mirrors the customer's checkout preview. */
export function platformFeeMinor(subtotalMinor: number): number {
  const subSar = fromMinor(subtotalMinor);
  const rate = subSar >= 250 ? 0.04 : subSar >= 100 ? 0.03 : 0.02;
  return Math.round(subtotalMinor * rate);
}

/**
 * Largest-remainder allocation. Given a `total` (int) and non-negative
 * `weights` (int[]), returns int[] the same length such that the sum equals
 * `total` exactly and each element is close to `total * weight / sum(weights)`.
 * Every allocated halala goes to the line with the largest fractional
 * remainder, then the next-largest, and so on — never overshoots.
 */
export function distributeMinor(total: number, weights: readonly number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w) * total) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let allocated = floors.reduce((s, x) => s + x, 0);
  let leftover = total - allocated;
  // sort indices by fractional remainder descending, then by original weight desc as tiebreaker
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => (b.frac - a.frac) || (b.w - a.w));
  for (let k = 0; leftover > 0 && k < order.length; k++, leftover--) {
    floors[order[k].i] += 1;
  }
  return floors;
}

export interface LineIn {
  id: string | number;
  name: string;
  nameAr?: string;
  emoji?: string;
  note?: string;
  menuPrice: number; // SAR
  appPrice: number;  // SAR
  qty: number;
}

export interface LineSnapshot {
  id: string | number;
  name: string;
  nameAr?: string;
  emoji?: string;
  note?: string;
  menuPrice: number;    // SAR — what the counter charges
  appPrice: number;     // SAR — what the app charges
  price: number;        // SAR — deprecated alias of appPrice (kept so pre-Phase-6 readers still work)
  qty: number;
  lineSubtotal: number; // SAR — appPrice × qty (before discount)
  lineMenuValue: number;// SAR — menuPrice × qty (imaginary counter value)
  lineDiscount: number; // SAR — proportional share of order-level discount
  lineReward: number;   // SAR — reserved for Phase 10/11 (always 0 here)
  lineTax: number;      // SAR — proportional share of VAT (inclusive)
  lineTotal: number;    // SAR — appPrice*qty − lineDiscount − lineReward
  lineNet: number;      // SAR — lineTotal − lineTax
}

export interface TotalsSnapshot {
  menuValue: number;    // SAR — Σ menuPrice*qty
  appValue: number;     // SAR — Σ appPrice*qty
  appDiscount: number;  // SAR — menuValue − appValue (the implicit "app savings")
  subtotal: number;     // SAR — same as appValue, kept for pre-Phase-6 readers
  pFee: number;         // SAR — platform fee on subtotal
  discount: number;     // SAR — coupon / order-level discount (positive)
  reward: number;       // SAR — reserved for Phase 10/11 (0)
  base: number;         // SAR — subtotal + pFee − discount − reward
  vat: number;          // SAR — 15/115 of base (inclusive)
  total: number;        // SAR — what customer pays (= base)
  net: number;          // SAR — total − vat (revenue net of VAT)
  vatInclusive: true;
}

export interface OrderMoney {
  items: LineSnapshot[];
  totals: TotalsSnapshot;
}

/**
 * Build the immutable money snapshot for an order. `discountMinor` is the
 * accepted coupon value (positive halalas). Returns per-line snapshots plus
 * the aggregated totals — every field is a rounded SAR float safe to
 * persist / display / print.
 */
export function priceOrder(lines: readonly LineIn[], discountMinor = 0, rewardMinor = 0): OrderMoney {
  if (lines.length === 0) {
    return {
      items: [],
      totals: {
        menuValue: 0, appValue: 0, appDiscount: 0,
        subtotal: 0, pFee: 0, discount: 0, reward: 0,
        base: 0, vat: 0, total: 0, net: 0, vatInclusive: true,
      },
    };
  }

  // Line-level subtotals in halalas — no floating loss across the sum.
  const menuMinorPerLine = lines.map((l) => toMinor(l.menuPrice) * l.qty);
  const appMinorPerLine = lines.map((l) => toMinor(l.appPrice) * l.qty);
  const menuValueMinor = menuMinorPerLine.reduce((s, x) => s + x, 0);
  const appValueMinor = appMinorPerLine.reduce((s, x) => s + x, 0);
  const subtotalMinor = appValueMinor;
  const pFeeMinor = platformFeeMinor(subtotalMinor);
  const discMinor = Math.max(0, Math.min(Math.round(discountMinor), subtotalMinor));
  const rewMinor = Math.max(0, Math.min(Math.round(rewardMinor), Math.max(0, subtotalMinor - discMinor)));
  const baseMinor = Math.max(0, subtotalMinor + pFeeMinor - discMinor - rewMinor);
  // VAT-inclusive slice out of the base.
  const vatMinor = Math.round((baseMinor * 15) / 115);
  const totalMinor = baseMinor;
  const netMinor = totalMinor - vatMinor;
  const appDiscountMinor = Math.max(0, menuValueMinor - appValueMinor);

  // Distribute order-level discount + reward + VAT across the lines using the
  // line's app-price weight, so a bigger line takes a bigger share and every
  // halala is accounted for (no drift from independent per-line rounding).
  const discPerLine = distributeMinor(discMinor, appMinorPerLine);
  const rewPerLine = distributeMinor(rewMinor, appMinorPerLine);
  const vatPerLine = distributeMinor(vatMinor, appMinorPerLine);

  const snapshots: LineSnapshot[] = lines.map((l, i) => {
    const lineSubMinor = appMinorPerLine[i];
    const lineMenuMinor = menuMinorPerLine[i];
    const lineDiscMinor = discPerLine[i] || 0;
    const lineRewMinor = rewPerLine[i] || 0;
    const lineVatMinor = vatPerLine[i] || 0;
    const lineTotalMinor = Math.max(0, lineSubMinor - lineDiscMinor - lineRewMinor);
    const lineNetMinor = Math.max(0, lineTotalMinor - lineVatMinor);
    const snap: LineSnapshot = {
      id: l.id,
      name: l.name,
      menuPrice: fromMinor(toMinor(l.menuPrice)),
      appPrice: fromMinor(toMinor(l.appPrice)),
      price: fromMinor(toMinor(l.appPrice)), // deprecated alias
      qty: l.qty,
      lineSubtotal: fromMinor(lineSubMinor),
      lineMenuValue: fromMinor(lineMenuMinor),
      lineDiscount: fromMinor(lineDiscMinor),
      lineReward: fromMinor(lineRewMinor),
      lineTax: fromMinor(lineVatMinor),
      lineTotal: fromMinor(lineTotalMinor),
      lineNet: fromMinor(lineNetMinor),
    };
    if (l.nameAr) snap.nameAr = l.nameAr;
    if (l.emoji) snap.emoji = l.emoji;
    if (l.note) snap.note = l.note;
    return snap;
  });

  return {
    items: snapshots,
    totals: {
      menuValue: fromMinor(menuValueMinor),
      appValue: fromMinor(appValueMinor),
      appDiscount: fromMinor(appDiscountMinor),
      subtotal: fromMinor(subtotalMinor),
      pFee: fromMinor(pFeeMinor),
      discount: fromMinor(discMinor),
      reward: fromMinor(rewMinor),
      base: fromMinor(baseMinor),
      vat: fromMinor(vatMinor),
      total: fromMinor(totalMinor),
      net: fromMinor(netMinor),
      vatInclusive: true,
    },
  };
}
