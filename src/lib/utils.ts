import { VAT_RATE, type MenuItem, type Branch } from './data';
import { priceOrder, toMinor } from './pricing';
void VAT_RATE; // re-exported below — silence the unused-import warning

export const APP_VERSION = '4.10.1';

/** Haversine distance in km between two lat/lng points. Used by BranchSelectStep to sort branches by proximity. */
export function calcDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Tiered platform fee: 4% / 3% / 2% of subtotal. */
export function platformFee(subtotal: number): number {
  const rate = subtotal >= 250 ? 0.04 : subtotal >= 100 ? 0.03 : 0.02;
  return Math.round(subtotal * rate * 100) / 100;
}

export const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

export const money = (n: number) => 'SR ' + (Math.round(n * 100) / 100).toFixed(2);

export function loyaltyPointsFor(total: number): number {
  return total >= 500 ? 35 : total >= 250 ? 20 : total >= 100 ? 10 : 5;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB') +
    '  ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

export interface OrderTotals {
  subtotal: number;
  pFee: number;
  discount: number;
  vat: number;
  total: number;
  vatInclusive?: boolean;
  /** Phase 6 additions — surfaced so the checkout preview can show the same */
  /** menu-value vs app-value split the server persists. */
  menuValue?: number;
  appValue?: number;
  appDiscount?: number;
  reward?: number;
  base?: number;
  net?: number;
  /** Deprecated — pickup-only app; kept so historical orders still deserialize. */
  dFee?: number;
}

/**
 * Compute display totals for the checkout preview. Delegates to the shared
 * pricing engine so client and server render identical numbers. `discount`
 * is the accepted coupon value in SAR.
 */
export function computeTotals(items: MenuItem[], discount: number): OrderTotals {
  const money = priceOrder(
    items
      .filter((i) => (i.qty || 0) > 0)
      .map((i) => ({
        id: i.id,
        name: i.name,
        nameAr: i.nameAr,
        emoji: i.emoji,
        note: i.note,
        appPrice: i.price,
        menuPrice: Number.isFinite(Number(i.menuPrice)) && Number(i.menuPrice) > 0 ? Number(i.menuPrice) : i.price,
        qty: i.qty || 0,
      })),
    toMinor(discount),
  );
  const t = money.totals;
  return {
    subtotal: t.subtotal,
    pFee: t.pFee,
    discount: t.discount,
    vat: t.vat,
    total: t.total,
    vatInclusive: true,
    menuValue: t.menuValue,
    appValue: t.appValue,
    appDiscount: t.appDiscount,
    reward: t.reward,
    base: t.base,
    net: t.net,
  };
}

// Re-export VAT_RATE so downstream consumers importing from utils don't need
// to reach into data.ts directly. Keeps this file the single money entry-point.
export { VAT_RATE };

export interface OrderPayload {
  branch: string;
  branchObj: Branch;
  items: MenuItem[];
  totals: OrderTotals;
  pickupTime: string;
  paymentMethod: string;
  note: string;
  couponCode: string;
  user: { name: string; phone: string };
  isAr: boolean;
}

/** Build the WhatsApp order message text (URL-encoded elsewhere). */
export function buildWhatsAppMessage(o: OrderPayload): string {
  const nl = '\n';
  const t = o.totals;
  const lines = [
    '🍗 NEW ORDER · Broast Al Bahr',
    '━━━━━━━━━━━━━━━━━━━━',
    `Branch: ${o.branchObj.nameEn}`,
    `Customer: ${o.user.name} | ${o.user.phone}`,
    `Type: Pickup 🏃`,
    `Time: ${o.pickupTime || 'ASAP'}`,
    `Payment: ${o.paymentMethod}`,
  ];
  if (o.note) lines.push(`Note: ${o.note}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━', 'ITEMS:');
  o.items.forEach((i) =>
    lines.push(`  ${i.emoji} ${o.isAr ? i.nameAr : i.name} ×${i.qty} = ${money(i.price * (i.qty || 0))}`),
  );
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Subtotal: ${money(t.subtotal)}`);
  lines.push(`Platform Fee: ${money(t.pFee)}`);
  if (t.discount) lines.push(`Discount (${o.couponCode}): - ${money(t.discount)}`);
  lines.push(`TOTAL: ${money(t.total)}`);
  lines.push(`(Prices include 15% VAT · ${money(t.vat)})`);
  return lines.join(nl);
}
