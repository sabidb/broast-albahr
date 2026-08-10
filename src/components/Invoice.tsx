import { motion } from 'framer-motion';
import { formatDate } from '../lib/utils';
import type { MenuItem } from '../lib/data';
import { buildInvoiceModel, type InvoiceModel } from '../lib/invoice';

const INVOICE_TERMS: { en: string; ar: string }[] = [
  {
    en: 'Your order will be READY within 15 MINUTES of confirmation. Please plan accordingly.',
    ar: 'سيكون طلبك جاهزاً خلال ١٥ دقيقة من التأكيد. يُرجى التخطيط وفقاً لذلك.',
  },
  {
    en: 'If you FAIL TO PICK UP your order on time, your account may be BANNED 🚫 and loyalty points DEDUCTED.',
    ar: 'إذا لم تستلم طلبك في الوقت المحدد، قد يتم حظر حسابك 🚫 وخصم نقاط الولاء.',
  },
  {
    en: 'Please arrive at the branch on time. Repeated late pickups may result in a permanent ban.',
    ar: 'يُرجى الحضور إلى الفرع في الوقت المحدد. التأخر المتكرر قد يؤدي إلى حظر دائم.',
  },
  {
    en: 'You may cancel your order any time before the branch accepts it. Once accepted, contact the branch for changes.',
    ar: 'يمكنك إلغاء الطلب قبل أن يقبله الفرع. بعد القبول، تواصل مع الفرع لأي تعديل.',
  },
  {
    en: 'Prices displayed INCLUDE 15% VAT. No hidden charges will be added at pickup.',
    ar: 'الأسعار المعروضة شاملة ضريبة القيمة المضافة ١٥٪. لن يتم إضافة أي رسوم مخفية عند الاستلام.',
  },
  {
    en: 'Please treat our staff with RESPECT. Abusive behavior may result in your account being permanently banned.',
    ar: 'يُرجى معاملة موظفينا باحترام. السلوك المسيء قد يؤدي إلى حظر حسابك بشكل دائم.',
  },
];

export interface Order {
  orderNo: string;
  date: string;
  user: { name: string; phone: string };
  branchObj: { nameEn: string; nameAr?: string; phone?: string; address?: string };
  orderType?: 'pickup' | 'delivery';
  pickupTime: string;
  paymentMethod: string;
  couponCode: string;
  items: MenuItem[];
  totals: {
    subtotal: number;
    pFee: number;
    discount: number;
    vat: number;
    total: number;
    dFee?: number;
    menuValue?: number;
    appValue?: number;
    appDiscount?: number;
    reward?: number;
    base?: number;
    net?: number;
  };
  fbId?: string | null;
  status?: string;
  rating?: { stars: number; comment: string } | null;
  refund?: { amount: number; reason: string | null; at: string; by: string };
}

const PAYMENT_STATUS_META: Record<InvoiceModel['paymentStatus'], { en: string; ar: string; color: string }> = {
  paid: { en: 'Paid', ar: 'مدفوع', color: '#059669' },
  pending: { en: 'Awaiting pickup', ar: 'في انتظار الاستلام', color: '#B45309' },
  refunded: { en: 'Refunded', ar: 'مسترد', color: '#9333EA' },
  failed: { en: 'Cancelled', ar: 'ملغى', color: '#DC2626' },
};

export default function Invoice({ order, onClose, isAr }: { order: Order; onClose: () => void; isAr: boolean }) {
  const model = buildInvoiceModel(order);
  const payStatus = PAYMENT_STATUS_META[model.paymentStatus];

  const print = () => {
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) return;
    const rows = model.lines
      .map((l) => {
        const nameCell = `${l.emoji || ''} ${l.name} ×${l.qty}`.trim();
        const priceCell = l.hasSaving && l.lineMenuValueFmt
          ? `<span style="color:#999;text-decoration:line-through;margin-right:6px">${l.lineMenuValueFmt}</span>${l.lineTotalFmt}`
          : l.lineTotalFmt;
        return `<div class="row"><span>${nameCell}</span><span>${priceCell}</span></div>` +
          (l.note ? `<div style="font-size:11px;color:#666;padding-left:12px;font-style:italic">📝 ${l.note}</div>` : '');
      })
      .join('');
    const rewardRow = model.reward
      ? `<hr class="divider"/><div class="center" style="border:2px dashed #E10600;padding:10px;border-radius:6px">
           <div style="font-size:10px;color:#999;letter-spacing:1px">REWARD CODE</div>
           <div style="font-family:monospace;font-size:20px;font-weight:900;color:#E10600;letter-spacing:3px">${model.reward.code}</div>
           <div style="font-size:11px;color:#666;margin-top:2px">${model.reward.label}</div>
         </div>`
      : '';
    const refundRow = model.totals.refundedFmt
      ? `<div class="row" style="color:#9333EA"><span>Refund${model.totals.refundReason ? ' (' + model.totals.refundReason + ')' : ''}</span><span>- ${model.totals.refundedFmt}</span></div>`
      : '';
    w.document.body.innerHTML = `<style>
      body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#000;background:#fff}
      .center{text-align:center}.logo{background:#cc0000;color:#ffdd00;padding:16px;border-radius:8px;margin-bottom:16px}
      .logo h2{margin:0;font-size:20px}.logo p{margin:4px 0 0;color:rgba(255,255,255,.8);font-size:12px}
      .divider{border:none;border-top:1px dashed #ccc;margin:12px 0}
      .row{display:flex;justify-content:space-between;margin:5px 0;font-size:13px}
      .row.total{font-size:17px;font-weight:900;border-top:2px solid #000;padding-top:8px;margin-top:8px}
      .footer{text-align:center;margin-top:16px;font-size:11px;color:#999}
      .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}</style>
      <div class="center logo"><h2>${model.restaurantName.toUpperCase()} · بروست البحر</h2><p>${model.branchName}${model.branchPhone ? ' · ' + model.branchPhone : ''}</p></div>
      <div class="center"><div style="font-size:11px;color:#999">ORDER</div>
        <div style="font-size:20px;font-weight:900">#${model.orderNo}</div>
        <div style="font-size:11px;color:#666">${model.dateFmt}</div>
        <div style="margin-top:4px"><span class="badge" style="background:${payStatus.color}22;color:${payStatus.color}">${payStatus.en}</span></div>
      </div>
      <hr class="divider"/>
      <div class="row"><span>Customer:</span><span><b>${model.customerName}</b></span></div>
      <div class="row"><span>Mobile:</span><span>${model.customerPhone}</span></div>
      <div class="row"><span>Type:</span><span>${model.orderType === 'pickup' ? 'Pickup' : 'Delivery'}</span></div>
      <div class="row"><span>Payment:</span><span>${model.paymentMethod}</span></div>
      <hr class="divider"/>${rows}<hr class="divider"/>
      <div class="row"><span>Subtotal:</span><span>${model.totals.subtotalFmt}</span></div>
      ${model.totals.appSavingsFmt ? `<div class="row" style="color:#059669"><span>App savings:</span><span>- ${model.totals.appSavingsFmt}</span></div>` : ''}
      <div class="row"><span>Platform Fee:</span><span>${model.totals.pFeeFmt}</span></div>
      ${model.totals.discountFmt ? `<div class="row" style="color:green"><span>Discount${model.couponCode ? ' (' + model.couponCode + ')' : ''}:</span><span>- ${model.totals.discountFmt}</span></div>` : ''}
      ${refundRow}
      <div class="row total"><span>TOTAL:</span><span>${model.totals.totalFmt}</span></div>
      ${rewardRow}
      <div class="footer">
        <p style="font-size:10px;color:#999">Prices include 15% VAT (${model.totals.vatFmt})</p>
        <p>شكراً لزيارتكم · Thank you!</p>
        <p style="font-size:10px">VAT Reg. No: ${model.vatRegNo}</p>
      </div>`;
    w.document.title = `Invoice ${model.orderNo}`;
    setTimeout(() => w.print(), 400);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[500] flex items-center justify-center bg-brand-ink/50 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-[380px] overflow-y-auto rounded-2xl bg-white font-sans text-black"
      >
        <div className="rounded-t-2xl bg-brand-red px-5 pb-4 pt-5 text-center">
          <div className="font-display text-lg font-extrabold tracking-tight text-white">
            {model.restaurantName.toUpperCase()}
          </div>
          <div className="mt-0.5 font-arabic text-[13px] text-white/90">بروست البحر</div>
          <div className="mt-1 text-[11px] text-white/75">
            {model.branchName}{model.branchPhone ? ' · ' + model.branchPhone : ''}
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="mb-3.5 border-b border-dashed border-gray-300 pb-3.5 text-center">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">Invoice</div>
            <div className="text-[26px] font-black text-brand-red">#{model.orderNo}</div>
            <div className="text-xs text-gray-500">{formatDate(order.date)}</div>
            <div className="mt-1.5">
              <span
                className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
                style={{ background: payStatus.color + '20', color: payStatus.color }}
              >
                {isAr ? payStatus.ar : payStatus.en}
              </span>
            </div>
          </div>
          {(
            [
              ['👤 ' + (isAr ? 'العميل' : 'Customer'), model.customerName],
              ['📱 ' + (isAr ? 'الجوال' : 'Mobile'), model.customerPhone],
              ['🏷️ ' + (isAr ? 'النوع' : 'Type'), model.orderType === 'pickup' ? (isAr ? 'استلام' : 'Pickup') : (isAr ? 'توصيل' : 'Delivery')],
              ['💳 ' + (isAr ? 'الدفع' : 'Payment'), model.paymentMethod],
            ] as [string, string][]
          ).map(([l, v]) => (
            <div key={l} className="mb-1.5 flex justify-between text-xs">
              <span className="text-gray-500">{l}</span>
              <span className="font-bold">{v}</span>
            </div>
          ))}
          <div className="my-3 border-t border-dashed border-gray-200 pt-3">
            {model.lines.map((l, idx) => (
              <div key={idx} className="mb-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span>
                    {l.emoji} {l.name} <span className="text-gray-400">×{l.qty}</span>
                  </span>
                  <span className="font-bold">
                    {l.hasSaving && l.lineMenuValueFmt && (
                      <span className="me-1.5 text-[11px] font-semibold text-gray-400 line-through">{l.lineMenuValueFmt}</span>
                    )}
                    {l.lineTotalFmt}
                  </span>
                </div>
                {l.note && (
                  <div className="mt-0.5 pl-4 text-[11px] italic text-gray-500">
                    📝 {l.note}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-gray-200 pt-3 text-[13px]">
            <Row l={isAr ? 'المجموع الفرعي' : 'Subtotal'} v={model.totals.subtotalFmt} />
            {model.totals.appSavingsFmt && (
              <Row l={isAr ? 'خصم التطبيق' : 'App savings'} v={'- ' + model.totals.appSavingsFmt} green />
            )}
            <Row l={isAr ? 'رسوم المنصة' : 'Platform Fee'} v={model.totals.pFeeFmt} />
            {model.totals.discountFmt && (
              <Row
                l={`${isAr ? 'خصم' : 'Discount'}${model.couponCode ? ` (${model.couponCode})` : ''}`}
                v={'- ' + model.totals.discountFmt}
                green
              />
            )}
            {model.totals.refundedFmt && (
              <Row
                l={`${isAr ? 'استرداد' : 'Refund'}${model.totals.refundReason ? ` (${model.totals.refundReason})` : ''}`}
                v={'- ' + model.totals.refundedFmt}
                purple
              />
            )}
            <div className="mb-1 text-[10px] text-gray-400">
              {isAr
                ? `الأسعار شاملة ضريبة القيمة المضافة 15% (${model.totals.vatFmt})`
                : `Prices include 15% VAT (${model.totals.vatFmt})`}
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-black pt-2 text-[17px] font-black">
              <span>{isAr ? 'الإجمالي' : 'TOTAL'}</span>
              <span>{model.totals.totalFmt}</span>
            </div>
          </div>

          {/* Phase 11 reward slot — renders only when the order carries an
              eligible reward. Reserved layout so future rewards don't shift
              the invoice on customers who don't have one yet. */}
          {model.reward && (
            <div className="mt-4 rounded-xl border-2 border-dashed border-brand-red bg-red-50 p-3 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                {isAr ? 'رمز المكافأة' : 'Reward code'}
              </div>
              <div className="mt-1 font-mono text-[22px] font-black tracking-[3px] text-brand-red">
                {model.reward.code}
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-gray-600">{model.reward.label}</div>
            </div>
          )}

          <div className="mt-5 rounded-xl border-2 border-red-200 bg-red-50 p-3">
            <div className="mb-2 text-center text-[12px] font-black uppercase text-red-700">
              ⚠️ Terms &amp; Conditions · الشروط والأحكام
            </div>
            <div className="space-y-2">
              {INVOICE_TERMS.map((t, i) => (
                <div key={i} className="rounded-lg bg-white p-2">
                  <div className="mb-1 flex items-center">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white">
                      {i + 1}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-start text-[10px] font-black leading-snug text-gray-800" dir="ltr">
                      {t.en}
                    </div>
                    <div className="text-end font-arabic text-[10px] font-black leading-snug text-gray-800" dir="rtl">
                      {t.ar}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-center text-[10px] font-black text-red-700">
              By placing an order you AGREE to all terms above ·{' '}
              <span className="font-arabic">بتقديم طلبك فإنك توافق على جميع الشروط أعلاه</span>
            </div>
          </div>

          <div className="mt-4 text-center text-[9px] font-semibold text-gray-400">
            VAT Reg. No: {model.vatRegNo}
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={print} className="flex-1 rounded-xl bg-brand-red py-3 font-bold text-white">
              🖨️ {isAr ? 'طباعة' : 'Print'}
            </button>
            <button onClick={onClose} className="flex-1 rounded-xl bg-gray-200 py-3 font-bold text-gray-700">
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Row({ l, v, green, purple }: { l: string; v: string; green?: boolean; purple?: boolean }) {
  const color = green ? '#059669' : purple ? '#9333EA' : '#555';
  return (
    <div className="mb-1 flex justify-between" style={{ color }}>
      <span>{l}</span>
      <span>{v}</span>
    </div>
  );
}
