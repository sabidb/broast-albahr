import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Invoice, { type Order } from './Invoice';

export default function OrderSuccess({
  order,
  onNewOrder,
  isAr,
}: {
  order: Order;
  onNewOrder: () => void;
  isAr: boolean;
}) {
  const [showInvoice, setShowInvoice] = useState(false);
  const confetti = ['🎉', '🎊', '✨', '🍗', '⭐', '🎈'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative mx-auto max-w-[440px] px-6 py-14 text-center"
    >
      {confetti.map((c, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute text-2xl"
          style={{ left: `${10 + i * 15}%`, top: 0 }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: [0, 320], opacity: [0, 1, 0], rotate: [0, 180 + i * 30] }}
          transition={{ duration: 2.4, delay: i * 0.15, repeat: Infinity, repeatDelay: 1.5 }}
        >
          {c}
        </motion.span>
      ))}

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 15 }}
        className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-card"
      >
        <svg width="72" height="72" viewBox="0 0 72 72">
          <motion.circle
            cx="36"
            cy="36"
            r="31"
            fill="none"
            stroke="#11845B"
            strokeWidth="5"
            strokeLinecap="round"
            initial={{ pathLength: 0, rotate: -90 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: 'easeInOut', delay: 0.15 }}
            style={{ transformOrigin: 'center' }}
          />
          <motion.path
            d="M22 37 L32 47 L51 26"
            fill="none"
            stroke="#11845B"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.7 }}
          />
        </svg>
      </motion.div>
      <h2 className="mb-2.5 text-3xl font-black text-brand-ink">{isAr ? 'تم إرسال طلبك!' : 'Order Sent!'}</h2>
      <p className="mb-6 text-sm font-semibold leading-relaxed text-brand-muted">
        {isAr
          ? `شكراً ${order.user.name}! تم إرسال طلبك عبر واتساب. سنتواصل معك قريباً لتأكيد الطلب.`
          : `Thanks ${order.user.name}! Your order was sent via WhatsApp. We'll confirm shortly.`}
      </p>

      <div className="mb-6 rounded-3xl border-2 border-brand-green/25 bg-brand-green/8 px-5 py-4">
        <div className="text-[13px] font-black uppercase tracking-wide text-brand-green">
          {isAr ? 'رقم الطلب' : 'Order No.'}
        </div>
        <div className="text-3xl font-black text-brand-green">#{order.orderNo}</div>
      </div>

      <div className="flex flex-col gap-3">
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowInvoice(true)}
          className="sheen rounded-2xl bg-brand-red py-4 text-[15px] font-black text-white shadow-red"
        >
          🧾 {isAr ? 'عرض الفاتورة' : 'View Invoice'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNewOrder}
          className="rounded-2xl border-2 border-brand-red bg-white py-3.5 text-[15px] font-black text-brand-red"
        >
          + {isAr ? 'طلب جديد' : 'New Order'}
        </motion.button>
      </div>

      <AnimatePresence>
        {showInvoice && <Invoice order={order} onClose={() => setShowInvoice(false)} isAr={isAr} />}
      </AnimatePresence>
    </motion.div>
  );
}
