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
      className="fixed inset-0 z-[400] bg-black/70"
    >
      <motion.div
        variants={drawer}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="glass absolute inset-y-0 end-0 flex w-[88%] max-w-[400px] flex-col border-s border-brand-gold/15 p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-extrabold text-brand-gold">
            {isAr ? 'حسابي' : 'My Account'}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/5 text-lg text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-2 rounded-xl bg-black/40 p-1">
          {(['orders', 'chat'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative flex-1 rounded-lg py-2 text-[13px] font-bold"
              style={{ color: tab === t ? '#000' : '#888' }}
            >
              {tab === t && (
                <motion.div
                  layoutId="tab-pill"
                  className="absolute inset-0 -z-10 rounded-lg bg-brand-gold"
                />
              )}
              {t === 'orders' ? (isAr ? 'طلباتي' : 'Orders') : isAr ? 'مساعد' : 'AI Chat'}
            </button>
          ))}
        </div>

        {tab === 'orders' ? (
          <div className="flex-1 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="mt-16 text-center text-sm text-brand-muted">
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
                  className="card-surface mb-2.5 p-3.5"
                >
                  <div className="mb-1 flex justify-between">
                    <span className="font-extrabold text-brand-gold">#{o.orderNo}</span>
                    <span className="text-[11px] text-brand-muted">{formatDate(o.date)}</span>
                  </div>
                  <div className="mb-2 text-[11px] text-brand-muted">
                    {o.orderType === 'pickup' ? '🏃 Pickup' : '🛵 Delivery'} · {o.items.length}{' '}
                    {isAr ? 'صنف' : 'items'}
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-2 text-sm">
                    <span className="text-brand-muted">{isAr ? 'الإجمالي' : 'Total'}</span>
                    <span className="font-extrabold text-brand-gold">{money(o.totals.total)}</span>
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
