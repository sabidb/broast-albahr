import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Invoice, { type Order } from './Invoice';
import { money } from '../lib/utils';

type Branch = { nameEn: string; nameAr?: string };

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
  const b = order.branchObj as Branch;
  const branchName = isAr && b.nameAr ? b.nameAr : b.nameEn;
  const t = order.totals;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-end justify-center bg-brand-ink/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
      onClick={onNewOrder}
    >
      {/* falling confetti behind the card */}
      {['🎉', '✨', '🎊', '⭐', '🍗', '🎈', '💥'].map((c, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute text-2xl"
          style={{ left: `${8 + i * 13}%`, top: '-3%' }}
          initial={{ y: -30, opacity: 0, rotate: 0 }}
          animate={{ y: '108vh', opacity: [0, 1, 1, 0], rotate: 360 + i * 90 }}
          transition={{ duration: 3.2, delay: i * 0.12, ease: 'easeIn', repeat: Infinity, repeatDelay: 1.8 }}
        >
          {c}
        </motion.span>
      ))}

      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ y: '100%', scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] overflow-hidden rounded-t-[28px] bg-brand-cream shadow-card sm:rounded-[28px]"
      >
        {/* red hero band */}
        <div
          className="relative overflow-hidden px-6 pb-16 pt-8 text-center text-white"
          style={{ background: 'linear-gradient(135deg,#E10600 0%,#B00000 60%,#8A0000 100%)' }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.15 }}
            className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-red"
          >
            <svg width="64" height="64" viewBox="0 0 64 64">
              <motion.circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="#11845B"
                strokeWidth="5"
                strokeLinecap="round"
                initial={{ pathLength: 0, rotate: -90 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, ease: 'easeInOut', delay: 0.3 }}
                style={{ transformOrigin: 'center' }}
              />
              <motion.path
                d="M20 33 L29 42 L46 24"
                fill="none"
                stroke="#11845B"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut', delay: 0.9 }}
              />
            </svg>
          </motion.div>
          <motion.h2
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-1 text-[26px] font-black leading-tight"
          >
            {isAr ? 'تم تأكيد طلبك!' : 'Order Confirmed!'}
          </motion.h2>
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-[13px] font-semibold text-white/90"
          >
            {isAr ? `شكراً ${order.user.name} 🙌` : `Thank you, ${order.user.name} 🙌`}
          </motion.p>
        </div>

        {/* order-no chip floating over the hero */}
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.45 }}
          className="mx-auto -mt-10 mb-2 w-[86%] rounded-2xl bg-white px-5 py-3.5 text-center shadow-card"
        >
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted">
            {isAr ? 'رقم الطلب' : 'Order Number'}
          </div>
          <div className="mt-0.5 font-display text-[34px] font-black leading-none text-brand-red">
            #{order.orderNo}
          </div>
        </motion.div>

        {/* body */}
        <div className="max-h-[54vh] overflow-y-auto px-5 pb-5">
          {/* branch + type */}
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="mb-3 grid grid-cols-2 gap-2.5"
          >
            <div className="rounded-xl border border-brand-line bg-white px-3 py-2.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-brand-muted">
                {isAr ? 'الفرع' : 'Branch'}
              </div>
              <div className="mt-0.5 text-[13px] font-black leading-tight text-brand-ink">{branchName}</div>
            </div>
            <div className="rounded-xl border border-brand-line bg-white px-3 py-2.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-brand-muted">
                {isAr ? 'نوع الطلب' : 'Type'}
              </div>
              <div className="mt-0.5 text-[13px] font-black leading-tight text-brand-ink">
                {order.orderType === 'pickup'
                  ? isAr
                    ? 'استلام 🏃'
                    : 'Pickup 🏃'
                  : isAr
                    ? 'توصيل 🛵'
                    : 'Delivery 🛵'}
              </div>
            </div>
            {order.orderType === 'pickup' && order.pickupTime && (
              <div className="col-span-2 rounded-xl border border-brand-line bg-white px-3 py-2.5">
                <div className="text-[10px] font-black uppercase tracking-wide text-brand-muted">
                  {isAr ? 'وقت الاستلام' : 'Pickup Time'}
                </div>
                <div className="mt-0.5 text-[13px] font-black leading-tight text-brand-ink">{order.pickupTime}</div>
              </div>
            )}
            <div className="col-span-2 rounded-xl border border-brand-line bg-white px-3 py-2.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-brand-muted">
                {isAr ? 'طريقة الدفع' : 'Payment'}
              </div>
              <div className="mt-0.5 text-[13px] font-black leading-tight text-brand-ink">{order.paymentMethod}</div>
            </div>
          </motion.div>

          {/* items */}
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.62 }}
            className="mb-3 rounded-xl border border-brand-line bg-white p-3"
          >
            <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-brand-muted">
              {isAr ? 'الأصناف' : 'Items'}
            </div>
            <div className="space-y-1.5">
              {order.items.map((i) => (
                <div key={i.id} className="text-[13px]">
                  <div className="flex items-baseline justify-between">
                    <span className="truncate font-bold text-brand-ink">
                      {(isAr ? i.nameAr : i.name) || i.name} × {i.qty}
                    </span>
                    <span className="ms-3 shrink-0 font-black text-brand-ink">
                      {money(i.price * (i.qty || 0))}
                    </span>
                  </div>
                  {i.note && (
                    <div className="mt-0.5 text-[11px] font-semibold italic text-brand-muted">
                      📝 {i.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* totals */}
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.68 }}
            className="mb-4 rounded-xl border border-brand-line bg-white p-3"
          >
            <div className="space-y-1 text-[12px] font-semibold text-brand-muted">
              <div className="flex justify-between">
                <span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                <span>{money(t.subtotal)}</span>
              </div>
              {t.pFee > 0 && (
                <div className="flex justify-between">
                  <span>{isAr ? 'رسوم المنصة' : 'Platform Fee'}</span>
                  <span>{money(t.pFee)}</span>
                </div>
              )}
              {t.dFee > 0 && (
                <div className="flex justify-between">
                  <span>{isAr ? 'التوصيل' : 'Delivery'}</span>
                  <span>{money(t.dFee)}</span>
                </div>
              )}
              {t.discount > 0 && (
                <div className="flex justify-between text-brand-green">
                  <span>{isAr ? 'الخصم' : 'Discount'}{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                  <span>- {money(t.discount)}</span>
                </div>
              )}
            </div>
            <div className="mt-1 text-[10px] font-medium text-brand-muted/70">
              {isAr ? `الأسعار شاملة ضريبة القيمة المضافة 15% (${money(t.vat)})` : `Prices include 15% VAT (${money(t.vat)})`}
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-brand-line pt-2">
              <span className="text-[14px] font-black text-brand-ink">{isAr ? 'الإجمالي' : 'Total'}</span>
              <span className="font-display text-[24px] font-black leading-none text-brand-red">
                {money(t.total)}
              </span>
            </div>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.75 }}
            className="flex flex-col gap-2.5"
          >
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={onNewOrder}
              className="sheen w-full rounded-2xl bg-brand-red py-3.5 text-[15px] font-black text-white shadow-red"
            >
              {isAr ? 'حسناً، شكراً!' : 'OK, Got It!'}
            </motion.button>
            <button
              onClick={() => setShowInvoice(true)}
              className="w-full rounded-2xl border-2 border-brand-line bg-white py-3 text-[13px] font-black text-brand-ink2"
            >
              🧾 {isAr ? 'عرض الفاتورة الكاملة' : 'View Full Invoice'}
            </button>
          </motion.div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showInvoice && <Invoice order={order} onClose={() => setShowInvoice(false)} isAr={isAr} />}
      </AnimatePresence>
    </motion.div>
  );
}
