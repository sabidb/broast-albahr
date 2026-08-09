// Client mirror of functions/src/pricing.ts. The server-side priceOrder is
// authoritative — this exists so the checkout preview can show the same
// numbers before the callable returns.
//
// Keep the two files in lockstep; every change here needs the same change on
// the server, and vice-versa. The order snapshot the customer actually keeps
// comes back from submitOrder, so any drift here is cosmetic (an outdated
// preview) but still worth avoiding.

export const VAT_RATE = 0.15;

export function toMinor(sar: number): number {
  if (!Number.isFinite(sar)) return 0;
  return Math.round(sar * 100);
}
export function fromMinor(hal: number): number {
  return Math.round(hal) / 100;
}

export function platformFeeMinor(subtotalMinor: number): number {
  const sub = fromMinor(subtotalMinor);
  const rate = sub >= 250 ? 0.04 : sub >= 100 ? 0.03 : 0.02;
  return Math.round(subtotalMinor * rate);
}

export function distributeMinor(total: number, weights: readonly number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w) * total) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let allocated = floors.reduce((s, x) => s + x, 0);
  let leftover = total - allocated;
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
  menuPrice: number;
  appPrice: number;
  qty: number;
}

export interface LineSnapshot {
  id: string | number;
  name: string;
  nameAr?: string;
  emoji?: string;
  note?: string;
  menuPrice: number;
  appPrice: number;
  price: number;
  qty: number;
  lineSubtotal: number;
  lineMenuValue: number;
  lineDiscount: number;
  lineReward: number;
  lineTax: number;
  lineTotal: number;
  lineNet: number;
}

export interface TotalsSnapshot {
  menuValue: number;
  appValue: number;
  appDiscount: number;
  subtotal: number;
  pFee: number;
  discount: number;
  reward: number;
  base: number;
  vat: number;
  total: number;
  net: number;
  vatInclusive: true;
}

export interface OrderMoney {
  items: LineSnapshot[];
  totals: TotalsSnapshot;
}

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
  const menuMinorPerLine = lines.map((l) => toMinor(l.menuPrice) * l.qty);
  const appMinorPerLine = lines.map((l) => toMinor(l.appPrice) * l.qty);
  const menuValueMinor = menuMinorPerLine.reduce((s, x) => s + x, 0);
  const appValueMinor = appMinorPerLine.reduce((s, x) => s + x, 0);
  const subtotalMinor = appValueMinor;
  const pFeeMinor = platformFeeMinor(subtotalMinor);
  const discMinor = Math.max(0, Math.min(Math.round(discountMinor), subtotalMinor));
  const rewMinor = Math.max(0, Math.min(Math.round(rewardMinor), Math.max(0, subtotalMinor - discMinor)));
  const baseMinor = Math.max(0, subtotalMinor + pFeeMinor - discMinor - rewMinor);
  const vatMinor = Math.round((baseMinor * 15) / 115);
  const totalMinor = baseMinor;
  const netMinor = totalMinor - vatMinor;
  const appDiscountMinor = Math.max(0, menuValueMinor - appValueMinor);

  const discPerLine = distributeMinor(discMinor, appMinorPerLine);
  const rewPerLine = distributeMinor(rewMinor, appMinorPerLine);
  const vatPerLine = distributeMinor(vatMinor, appMinorPerLine);

  const items: LineSnapshot[] = lines.map((l, i) => {
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
      price: fromMinor(toMinor(l.appPrice)),
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
    items,
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
