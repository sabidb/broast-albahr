import { VAT_RATE, type MenuItem, type Branch } from './data';

export const APP_VERSION = '4.3.6';

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
  /** Deprecated — pickup-only app; kept so historical orders still deserialize. */
  dFee?: number;
}

export function computeTotals(items: MenuItem[], discount: number): OrderTotals {
  const subtotal = items.reduce((s, i) => s + i.price * (i.qty || 0), 0);
  const pFee = platformFee(subtotal);
  const base = Math.max(0, subtotal + pFee - discount);
  const vat = Math.round((base * VAT_RATE) / (1 + VAT_RATE) * 100) / 100;
  const total = Math.round(base * 100) / 100;
  return { subtotal, pFee, discount, vat, total, vatInclusive: true };
}

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
