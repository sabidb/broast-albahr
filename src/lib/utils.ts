import { DELIVERY_ZONES, VAT_RATE, type MenuItem, type Branch } from './data';

export const APP_VERSION = '3.6.1';

/** Haversine distance in km between two lat/lng points. */
export function calcDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Delivery fee by distance, or -1 when out of range. */
export function getDeliveryFee(km: number): number {
  for (const z of DELIVERY_ZONES) if (km <= z.maxKm) return z.fee;
  return -1;
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
  dFee: number;
  discount: number;
  vat: number;
  total: number;
  vatInclusive?: boolean;
}

export function computeTotals(
  items: MenuItem[],
  orderType: 'pickup' | 'delivery',
  deliveryFee: number | null,
  discount: number,
): OrderTotals {
  const subtotal = items.reduce((s, i) => s + i.price * (i.qty || 0), 0);
  const pFee = platformFee(subtotal);
  const dFee = orderType === 'delivery' ? deliveryFee || 0 : 0;
  const base = Math.max(0, subtotal + pFee + dFee - discount);
  const vat = Math.round((base * VAT_RATE) / (1 + VAT_RATE) * 100) / 100;
  const total = Math.round(base * 100) / 100;
  return { subtotal, pFee, dFee, discount, vat, total, vatInclusive: true };
}

export interface OrderPayload {
  branch: string;
  branchObj: Branch;
  orderType: 'pickup' | 'delivery';
  items: MenuItem[];
  totals: OrderTotals;
  pickupTime: string;
  paymentMethod: string;
  note: string;
  couponCode: string;
  locationLink: string;
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
    `Type: ${o.orderType === 'pickup' ? 'Pickup 🏃' : 'Delivery 🛵'}`,
    `Time: ${o.pickupTime || 'ASAP'}`,
    `Payment: ${o.paymentMethod}`,
  ];
  if (o.locationLink) lines.push(`Location: ${o.locationLink}`);
  if (o.note) lines.push(`Note: ${o.note}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━', 'ITEMS:');
  o.items.forEach((i) =>
    lines.push(`  ${i.emoji} ${o.isAr ? i.nameAr : i.name} ×${i.qty} = ${money(i.price * (i.qty || 0))}`),
  );
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Subtotal: ${money(t.subtotal)}`);
  lines.push(`Platform Fee: ${money(t.pFee)}`);
  if (o.orderType === 'delivery' && t.dFee) lines.push(`Delivery: ${money(t.dFee)}`);
  if (t.discount) lines.push(`Discount (${o.couponCode}): - ${money(t.discount)}`);
  lines.push(`TOTAL: ${money(t.total)}`);
  lines.push(`(Prices include 15% VAT · ${money(t.vat)})`);
  return lines.join(nl);
}
