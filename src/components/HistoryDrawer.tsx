import { useState } from 'react';
import { motion } from 'framer-motion';
import { drawer } from './motion';
import AiChat from './AiChat';
import { money, formatDate } from '../lib/utils';
import type { Order } from './Invoice';

export default function HistoryDrawer({
  orders,
  onClose,
  isAr,
}: {
  orders: Order[];
  onClose: () => void;
  isAr: boolean;
}) {
  const [tab, setTab] = useState<'orders' | 'chat'>('orders');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[400] bg-brand-ink/40 backdrop-blur-sm"
    >
      <motion.div
        variants={drawer}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-y-0 end-0 flex w-[88%] max-w-[400px] flex-col border-s border-brand-line bg-brand-cream p-5 shadow-[0_0_60px_rgba(0,0,0,0.2)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xl font-black text-brand-ink">{isAr ? 'حسابي' : 'My Account'}</div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg text-brand-ink shadow-soft"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-2xl bg-white p-1 shadow-soft">
          {(['orders', 'chat'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative flex-1 rounded-xl py-2.5 text-[13px] font-black"
              style={{ color: tab === t ? '#fff' : '#8C7A64' }}
            >
              {tab === t && <motion.div layoutId="tab-pill" className="absolute inset-0 -z-10 rounded-xl bg-brand-red" />}
              {t === 'orders' ? (isAr ? 'طلباتي' : 'Orders') : isAr ? 'مساعد' : 'AI Chat'}
            </button>
          ))}
        </div>

        {tab === 'orders' ? (
          <div className="flex-1 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="mt-16 text-center font-bold text-brand-muted">
                <div className="mb-3 text-5xl">🧾</div>
                {isAr ? 'لا توجد طلبات بعد' : 'No orders yet'}
              </div>
            ) : (
              orders.map((o, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card-surface mb-2.5 p-4"
                >
                  <div className="mb-1 flex justify-between">
                    <span className="font-black text-brand-red">#{o.orderNo}</span>
                    <span className="text-[11px] font-bold text-brand-muted">{formatDate(o.date)}</span>
                  </div>
                  <div className="mb-2 text-[11px] font-bold text-brand-muted">
                    {o.orderType === 'pickup' ? '🏃 Pickup' : '🛵 Delivery'} · {o.items.length}{' '}
                    {isAr ? 'صنف' : 'items'}
                  </div>
                  <div className="flex justify-between border-t border-brand-line pt-2 text-sm font-bold">
                    <span className="text-brand-muted">{isAr ? 'الإجمالي' : 'Total'}</span>
                    <span className="font-black text-brand-red">{money(o.totals.total)}</span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        ) : (
          <AiChat isAr={isAr} />
        )}
      </motion.div>
    </motion.div>
  );
}
