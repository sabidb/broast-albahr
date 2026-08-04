import { motion } from 'framer-motion';
import { money, formatDate } from '../lib/utils';
import ItemImage from './ItemImage';
import type { Order } from './Invoice';

export default function OrdersScreen({
  orders,
  isAr,
  onReorder,
}: {
  orders: Order[];
  isAr: boolean;
  onReorder: () => void;
}) {
  return (
    <div className="mx-auto max-w-[560px] px-4 pb-32 pt-5">
      <h2 className="mb-4 text-2xl font-black text-brand-ink">{isAr ? 'طلباتي 🧾' : 'My Orders 🧾'}</h2>
      {orders.length === 0 ? (
        <div className="mt-20 text-center">
          <div className="mb-3 text-6xl">🧾</div>
          <div className="font-black text-brand-ink">{isAr ? 'لا توجد طلبات بعد' : 'No orders yet'}</div>
          <p className="mt-1 text-[13px] font-semibold text-brand-muted">
            {isAr ? 'ابدأ أول طلب لك الآن!' : 'Place your first order now!'}
          </p>
          <button
            onClick={onReorder}
            className="mt-4 rounded-2xl bg-brand-red px-6 py-3 text-sm font-black text-white shadow-red"
          >
            {isAr ? 'تصفح القائمة' : 'Browse menu'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.45, ease: [0.22, 0.9, 0.28, 1] }}
              whileHover={{ y: -3 }}
              className="rounded-3xl bg-white p-4 shadow-soft ring-1 ring-brand-line"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-red/8 px-2.5 py-1 text-[13px] font-black text-brand-red">
                  #{o.orderNo}
                </span>
                <span className="text-[11px] font-bold text-brand-muted">{formatDate(o.date)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.items.slice(0, 5).map((it, k) => (
                  <span key={k} className="flex items-center gap-1 rounded-lg bg-brand-cream px-2 py-1 text-[12px] font-bold text-brand-ink2">
                    <span className="inline-block h-4 w-4 shrink-0 overflow-hidden rounded">
                      <ItemImage item={it} iconSize={11} />
                    </span>
                    ×{it.qty}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-brand-line pt-3">
                <span className="text-[12px] font-bold text-brand-muted">
                  {o.orderType === 'pickup' ? (isAr ? '🏃 استلام' : '🏃 Pickup') : isAr ? '🛵 توصيل' : '🛵 Delivery'}
                </span>
                <span className="text-[16px] font-black text-brand-red">{money(o.totals.total)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
