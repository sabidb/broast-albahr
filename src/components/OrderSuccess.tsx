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
      className="relative mx-auto max-w-[420px] px-6 py-14 text-center"
    >
      {/* floating confetti */}
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
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        className="mb-4 text-[70px]"
      >
        🎉
      </motion.div>
      <h2 className="mb-2.5 text-2xl font-extrabold text-brand-gold">
        {isAr ? 'تم إرسال طلبك!' : 'Order Sent!'}
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-brand-muted">
        {isAr
          ? `شكراً ${order.user.name}! تم إرسال طلبك عبر واتساب. سنتواصل معك قريباً لتأكيد الطلب.`
          : `Thanks ${order.user.name}! Your order was sent via WhatsApp. We'll confirm shortly.`}
      </p>

      <div className="mb-6 rounded-2xl border border-[#2d7a2d] bg-[#0a2a0a] px-5 py-4">
        <div className="text-[13px] text-[#6fcf6f]">{isAr ? 'رقم الطلب' : 'Order No.'}</div>
        <div className="text-2xl font-black text-[#4caf50]">#{order.orderNo}</div>
      </div>

      <div className="flex flex-col gap-3">
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowInvoice(true)}
          className="sheen rounded-2xl py-3.5 text-[15px] font-extrabold text-black shadow-gold"
          style={{ background: 'linear-gradient(135deg,#FFD400,#FF8C00)' }}
        >
          🧾 {isAr ? 'عرض الفاتورة' : 'View Invoice'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNewOrder}
          className="rounded-2xl border-2 border-brand-gold py-3 text-[15px] font-extrabold text-brand-gold"
          style={{ background: 'linear-gradient(135deg,#cc0000,#990000)' }}
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
