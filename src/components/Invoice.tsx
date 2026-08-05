import { motion } from 'framer-motion';
import { money, formatDate } from '../lib/utils';
import type { MenuItem } from '../lib/data';

export interface Order {
  orderNo: string;
  date: string;
  user: { name: string; phone: string };
  branchObj: { nameEn: string };
  orderType: 'pickup' | 'delivery';
  pickupTime: string;
  paymentMethod: string;
  couponCode: string;
  items: MenuItem[];
  totals: { subtotal: number; pFee: number; dFee: number; discount: number; vat: number; total: number };
}

export default function Invoice({ order, onClose, isAr }: { order: Order; onClose: () => void; isAr: boolean }) {
  const t = order.totals;
  const print = () => {
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) return;
    const rows = order.items
      .map(
        (i) =>
          `<div class="row"><span>${i.emoji} ${i.name} ×${i.qty}</span><span>${money(i.price * (i.qty || 0))}</span></div>`,
      )
      .join('');
    w.document.write(`<html><head><title>Invoice ${order.orderNo}</title><style>
      body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#000;background:#fff}
      .center{text-align:center}.logo{background:#cc0000;color:#ffdd00;padding:16px;border-radius:8px;margin-bottom:16px}
      .logo h2{margin:0;font-size:20px}.logo p{margin:4px 0 0;color:rgba(255,255,255,.8);font-size:12px}
      .divider{border:none;border-top:1px dashed #ccc;margin:12px 0}
      .row{display:flex;justify-content:space-between;margin:5px 0;font-size:13px}
      .row.total{font-size:17px;font-weight:900;border-top:2px solid #000;padding-top:8px;margin-top:8px}
      .footer{text-align:center;margin-top:16px;font-size:11px;color:#999}</style></head><body>
      <div class="center logo"><h2>BROAST AL BAHR · بروست البحر</h2><p>${order.branchObj.nameEn}</p></div>
      <div class="center"><div style="font-size:11px;color:#999">ORDER</div>
      <div style="font-size:20px;font-weight:900">#${order.orderNo}</div>
      <div style="font-size:11px;color:#666">${formatDate(order.date)}</div></div>
      <hr class="divider"/>
      <div class="row"><span>Customer:</span><span><b>${order.user.name}</b></span></div>
      <div class="row"><span>Mobile:</span><span>${order.user.phone}</span></div>
      <div class="row"><span>Type:</span><span>${order.orderType === 'pickup' ? 'Pickup' : 'Delivery'}</span></div>
      <div class="row"><span>Payment:</span><span>${order.paymentMethod}</span></div>
      <hr class="divider"/>${rows}<hr class="divider"/>
      <div class="row"><span>Subtotal:</span><span>${money(t.subtotal)}</span></div>
      <div class="row"><span>Platform Fee:</span><span>${money(t.pFee)}</span></div>
      ${t.dFee ? `<div class="row"><span>Delivery:</span><span>${money(t.dFee)}</span></div>` : ''}
      ${t.discount ? `<div class="row" style="color:green"><span>Discount (${order.couponCode}):</span><span>- ${money(t.discount)}</span></div>` : ''}
      <div class="row"><span>VAT (15%):</span><span>${money(t.vat)}</span></div>
      <div class="row total"><span>TOTAL:</span><span>${money(t.total)}</span></div>
      <div class="footer"><p>شكراً لزيارتكم · Thank you!</p><p>VAT Reg. No: 311459656500003</p></div>
      </body></html>`);
    w.document.close();
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
          <div className="font-display text-lg font-extrabold tracking-tight text-white">BROAST AL BAHR</div>
          <div className="mt-0.5 font-arabic text-[13px] text-white/90">بروست البحر</div>
          <div className="mt-1 text-[11px] text-white/75">{order.branchObj.nameEn}</div>
        </div>
        <div className="px-5 py-4">
          <div className="mb-3.5 border-b border-dashed border-gray-300 pb-3.5 text-center">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">Invoice</div>
            <div className="text-[26px] font-black text-brand-red">#{order.orderNo}</div>
            <div className="text-xs text-gray-500">{formatDate(order.date)}</div>
          </div>
          {(
            [
              ['👤 Customer', order.user.name],
              ['📱 Mobile', order.user.phone],
              ['🏷️ Type', order.orderType === 'pickup' ? 'Pickup' : 'Delivery'],
              ['💳 Payment', order.paymentMethod],
            ] as [string, string][]
          ).map(([l, v]) => (
            <div key={l} className="mb-1.5 flex justify-between text-xs">
              <span className="text-gray-500">{l}</span>
              <span className="font-bold">{v}</span>
            </div>
          ))}
          <div className="my-3 border-t border-dashed border-gray-200 pt-3">
            {order.items.map((i, idx) => (
              <div key={idx} className="mb-1.5 flex justify-between text-[13px]">
                <span>
                  {i.emoji} {i.name} <span className="text-gray-400">×{i.qty}</span>
                </span>
                <span className="font-bold">{money(i.price * (i.qty || 0))}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-gray-200 pt-3 text-[13px]">
            <Row l="Subtotal" v={money(t.subtotal)} />
            <Row l="Platform Fee" v={money(t.pFee)} />
            {!!t.dFee && <Row l="Delivery" v={money(t.dFee)} />}
            {!!t.discount && <Row l={`Discount (${order.couponCode})`} v={'- ' + money(t.discount)} green />}
            <Row l="VAT (15%)" v={money(t.vat)} />
            <div className="mt-2 flex justify-between border-t-2 border-black pt-2 text-[17px] font-black">
              <span>TOTAL</span>
              <span>{money(t.total)}</span>
            </div>
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

function Row({ l, v, green }: { l: string; v: string; green?: boolean }) {
  return (
    <div className="mb-1 flex justify-between" style={{ color: green ? 'green' : '#555' }}>
      <span>{l}</span>
      <span>{v}</span>
    </div>
  );
}
