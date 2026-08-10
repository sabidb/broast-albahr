// Deterministic invoice/receipt model — Phase 7.
//
// Takes a persisted Order (post submitOrder@v2) and returns a fully
// structured invoice ready to render either on screen (Invoice.tsx) or to
// hand to a printer template. Every field comes from the immutable order
// snapshot; nothing here reaches back to the live menu.
//
// The output is intentionally boring data — no React, no HTML, no ESC/POS.
// That way both the customer invoice and the admin's thermal printer can
// consume it and stay consistent, and a diff on this file explains any
// discrepancy customers report.

import type { Order } from '../components/Invoice';
import { money as fmtMoney, formatDate } from './utils';

export interface InvoiceLine {
  id: string | number;
  name: string;
  nameAr?: string;
  qty: number;
  emoji?: string;
  note?: string;
  /** App selling price × qty, formatted "SR X.XX". */
  lineTotalFmt: string;
  /** Menu price × qty when it exists AND is higher than appPrice, else null. */
  lineMenuValueFmt: string | null;
  /** True when the customer saved something on this line vs the menu price. */
  hasSaving: boolean;
}

export interface InvoiceTotals {
  subtotalFmt: string;
  pFeeFmt: string;
  discountFmt: string | null;   // coupon / order-level discount
  appSavingsFmt: string | null; // menuValue − appValue
  vatFmt: string;
  totalFmt: string;
  /** Positive number when the order carries a refund block. */
  refundedFmt: string | null;
  refundReason: string | null;
}

export interface InvoiceModel {
  orderNo: string;
  dateFmt: string;
  restaurantName: string;
  branchName: string;
  branchNameAr: string | null;
  branchPhone: string | null;
  branchAddress: string | null;
  customerName: string;
  customerPhone: string;
  orderType: 'pickup' | 'delivery';
  paymentMethod: string;
  paymentStatus: 'paid' | 'pending' | 'refunded' | 'failed';
  status: string;
  couponCode: string | null;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  vatRegNo: string;
  /** True when the order has any menuPrice > appPrice on at least one line. */
  showAppSavingsBlock: boolean;
  /**
   * Reward / QR slot — Phase 11 fills this with the eligible reward code and
   * a payload for a QR image. Reserved now so the layout doesn't jump when
   * rewards ship. `null` means "no reward on this order — hide the section".
   */
  reward: null | {
    code: string;
    label: string;
    qrPayload?: string;
  };
}

const VAT_REG_NO = '311459656500003';

function derivePaymentStatus(order: Order): InvoiceModel['paymentStatus'] {
  const anyOrder = order as unknown as { refund?: unknown; status?: string };
  if (anyOrder.refund) return 'refunded';
  const s = String(anyOrder.status || '').toLowerCase();
  if (s === 'refunded') return 'refunded';
  if (s === 'cancelled' || s === 'payment_failed') return 'failed';
  if (s === 'completed' || s === 'done') return 'paid';
  return 'pending';
}

export function buildInvoiceModel(order: Order): InvoiceModel {
  const anyOrder = order as any;
  const orderType = (order.orderType || 'pickup') as 'pickup' | 'delivery';

  const lines: InvoiceLine[] = (order.items || []).map((raw: any) => {
    const qty = Number(raw.qty) || 1;
    const appPrice = Number(raw.appPrice ?? raw.price) || 0;
    const menuPrice = Number(raw.menuPrice) > 0 ? Number(raw.menuPrice) : appPrice;
    // Prefer the persisted lineTotal (Phase 6+) so on-screen matches
    // what the server billed — falls back to a fresh compute for
    // pre-Phase-6 orders.
    const lineTotal = Number(raw.lineTotal);
    const total = Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : appPrice * qty;
    const hasSaving = menuPrice > appPrice;
    return {
      id: raw.id,
      name: raw.name || '',
      nameAr: raw.nameAr,
      qty,
      emoji: raw.emoji,
      note: raw.note,
      lineTotalFmt: fmtMoney(total),
      lineMenuValueFmt: hasSaving ? fmtMoney(menuPrice * qty) : null,
      hasSaving,
    };
  });

  const t = order.totals as any;
  const appSavings = Number(t?.appDiscount) || 0;
  const discount = Number(t?.discount) || 0;
  const refundBlock = anyOrder.refund && typeof anyOrder.refund === 'object' ? anyOrder.refund : null;
  const refundedAmount = refundBlock ? Number(refundBlock.amount) || 0 : 0;

  return {
    orderNo: order.orderNo,
    dateFmt: formatDate(order.date),
    restaurantName: 'Broast Al Bahr',
    branchName: order.branchObj?.nameEn || '',
    branchNameAr: (order.branchObj as any)?.nameAr || null,
    branchPhone: (order.branchObj as any)?.phone || null,
    branchAddress: (order.branchObj as any)?.address || null,
    customerName: order.user?.name || '',
    customerPhone: order.user?.phone || '',
    orderType,
    paymentMethod: order.paymentMethod || 'cash',
    paymentStatus: derivePaymentStatus(order),
    status: String(anyOrder.status || 'new'),
    couponCode: order.couponCode ? String(order.couponCode) : null,
    lines,
    totals: {
      subtotalFmt: fmtMoney(t?.subtotal || 0),
      pFeeFmt: fmtMoney(t?.pFee || 0),
      discountFmt: discount > 0 ? fmtMoney(discount) : null,
      appSavingsFmt: appSavings > 0 ? fmtMoney(appSavings) : null,
      vatFmt: fmtMoney(t?.vat || 0),
      totalFmt: fmtMoney(t?.total || 0),
      refundedFmt: refundedAmount > 0 ? fmtMoney(refundedAmount) : null,
      refundReason: refundBlock ? (refundBlock.reason || null) : null,
    },
    vatRegNo: VAT_REG_NO,
    showAppSavingsBlock: appSavings > 0 || lines.some((l) => l.hasSaving),
    // Phase 11 stamps a reward block onto the order when one applies. Until
    // then the customer app has nothing to render here — keep it null so
    // the section stays hidden entirely.
    reward: (() => {
      const r = anyOrder.reward;
      if (r && typeof r === 'object' && r.code) {
        return {
          code: String(r.code),
          label: String(r.label || 'Reward'),
          qrPayload: r.qrPayload ? String(r.qrPayload) : undefined,
        };
      }
      return null;
    })(),
  };
}
