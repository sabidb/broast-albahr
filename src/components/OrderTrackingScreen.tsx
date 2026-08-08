import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { money } from '../lib/utils';
import { FB } from '../lib/fb';
import type { Order } from './Invoice';

interface Props {
  order: Order;
  isAr: boolean;
  onClose: () => void;
  onRate?: (fbId: string, stars: number, comment: string) => void;
}

type Status = 'pending' | 'accepted' | 'preparing' | 'cooking' | 'almost_ready' | 'ready' | 'completed' | 'cancelled' | 'refunded';

const STEPS: { key: Status; en: string; ar: string; icon: string; eta?: string; etaAr?: string }[] = [
  { key: 'pending', en: 'Waiting for confirmation', ar: 'في انتظار التأكيد', icon: '⏳' },
  { key: 'preparing', en: 'Your order is preparing', ar: 'طلبك قيد التحضير', icon: '👨‍🍳', eta: 'Will be ready in ~15 min', etaAr: 'سيكون جاهزاً خلال ~15 دقيقة' },
  { key: 'cooking', en: 'Cooking currently', ar: 'يتم الطبخ حالياً', icon: '🔥', eta: '~10 min remaining', etaAr: 'متبقي ~10 دقائق' },
  { key: 'almost_ready', en: 'Your order is almost ready', ar: 'طلبك على وشك الجهوز', icon: '⏰', eta: '~5 min remaining', etaAr: 'متبقي ~5 دقائق' },
  { key: 'ready', en: 'Your order is ready', ar: 'طلبك جاهز', icon: '🍽️' },
  { key: 'completed', en: 'Completed', ar: 'مكتمل', icon: '✅' },
];

function normalize(s?: string): Status {
  if (!s) return 'pending';
  const v = s.toLowerCase();
  if (v === 'new') return 'pending';
  if (v === 'done') return 'completed';
  if (v === 'accepted') return 'preparing';
  if ((STEPS as any).find((x: any) => x.key === v)) return v as Status;
  if (v === 'cancelled' || v === 'canceled') return 'cancelled';
  if (v === 'refunded') return 'refunded';
  return 'pending';
}

export default function OrderTrackingScreen({ order, isAr, onClose, onRate }: Props) {
  const [live, setLive] = useState<any>(order);
  const [showRate, setShowRate] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!order.fbId) return;
    const unsub = FB.subscribeOrder(order.fbId, (o) => {
      if (o) setLive({ ...order, ...o });
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.fbId]);

  const status = normalize(live?.status);
  const currentIdx = STEPS.findIndex((s) => s.key === status);
  const done = status === 'completed';
  const cancelled = status === 'cancelled' || status === 'refunded';

  useEffect(() => {
    if (done && !live?.rating && !showRate) {
      const t = setTimeout(() => setShowRate(true), 800);
      return () => clearTimeout(t);
    }
  }, [done, live?.rating, showRate]);

  const submitRating = () => {
    if (!order.fbId || !onRate) return;
    onRate(order.fbId, stars, comment.trim());
    setShowRate(false);
  };

  const branchName = isAr && live.branchObj?.nameAr ? live.branchObj.nameAr : live.branchObj?.nameEn;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] overflow-y-auto bg-brand-cream"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-[560px] px-5 pb-16 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg text-brand-ink shadow-soft"
          >
            ←
          </button>
          <span className="rounded-full bg-brand-red/10 px-3 py-1 text-[13px] font-black text-brand-red">
            #{live.orderNo}
          </span>
        </div>

        <h2 className="text-[26px] font-black leading-tight text-brand-ink">
          {cancelled
            ? isAr
              ? 'تم إلغاء الطلب'
              : 'Order cancelled'
            : done
              ? isAr
                ? 'تم تسليم طلبك!'
                : 'Order delivered!'
              : isAr
                ? 'جاري تحضير طلبك'
                : 'Your order is on its way'}
        </h2>
        <p className="mt-1 text-[13px] font-semibold text-brand-muted">{branchName}</p>

        {/* timeline */}
        {!cancelled && (
          <div className="mt-6 rounded-3xl bg-white p-5 shadow-card ring-1 ring-brand-line">
            {STEPS.map((s, i) => {
              const on = i <= currentIdx;
              const active = i === currentIdx;
              const lineOn = i < currentIdx;
              return (
                <div key={s.key} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <motion.div
                      initial={false}
                      animate={{
                        scale: active ? [1, 1.15, 1] : 1,
                        background: on ? '#E10600' : '#F3EBDF',
                        color: on ? '#fff' : '#8C7A64',
                      }}
                      transition={{ duration: 1.4, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-black"
                    >
                      {s.icon}
                    </motion.div>
                    {i < STEPS.length - 1 && (
                      <div
                        className="my-1 w-[3px] flex-1 rounded transition-colors"
                        style={{ minHeight: 30, background: lineOn ? '#E10600' : '#F3EBDF' }}
                      />
                    )}
                  </div>
                  <div className="flex-1 pb-4 pt-2">
                    <div className="text-[15px] font-black" style={{ color: on ? '#1E1206' : '#8C7A64' }}>
                      {isAr ? s.ar : s.en}
                    </div>
                    {active && (
                      <>
                        <div className="mt-0.5 text-[12px] font-semibold text-brand-red">
                          {isAr ? 'قيد التنفيذ الآن…' : 'in progress now…'}
                        </div>
                        {s.eta && (
                          <div className="mt-0.5 text-[11px] font-bold text-brand-muted">
                            {isAr ? s.etaAr : s.eta}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {cancelled && (
          <div className="mt-6 rounded-3xl bg-brand-red/10 p-5 text-center">
            <div className="text-4xl">{status === 'refunded' ? '💸' : '❌'}</div>
            <div className="mt-2 text-[15px] font-black text-brand-red">
              {status === 'refunded'
                ? isAr
                  ? 'تم استرداد المبلغ.'
                  : 'Your order has been refunded.'
                : isAr
                  ? 'اتصل بالفرع لتفاصيل الإلغاء.'
                  : 'Contact the branch for details.'}
            </div>
          </div>
        )}

        {/* details recap */}
        <div className="mt-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-brand-line">
          <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-brand-muted">
            {isAr ? 'ملخص الطلب' : 'Order Summary'}
          </div>
          <div className="space-y-1.5">
            {live.items.map((it: any, k: number) => (
              <div key={k} className="text-[13px]">
                <div className="flex items-baseline justify-between">
                  <span className="truncate font-bold text-brand-ink">
                    {(isAr ? it.nameAr : it.name) || it.name} × {it.qty}
                  </span>
                  <span className="ms-3 shrink-0 font-black text-brand-ink">{money(it.price * (it.qty || 0))}</span>
                </div>
                {it.note && (
                  <div className="mt-0.5 text-[11px] font-semibold italic text-brand-muted">
                    📝 {it.note}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-brand-line pt-3">
            <span className="text-[14px] font-black text-brand-ink">{isAr ? 'الإجمالي' : 'Total'}</span>
            <span className="font-display text-[22px] font-black text-brand-red">{money(live.totals.total)}</span>
          </div>
        </div>

        {live.rating && (
          <div className="mt-4 rounded-3xl bg-white p-4 text-center shadow-card ring-1 ring-brand-line">
            <div className="text-[11px] font-black uppercase tracking-wide text-brand-muted">
              {isAr ? 'تقييمك' : 'Your rating'}
            </div>
            <div className="mt-1 text-2xl">{'⭐️'.repeat(live.rating.stars)}</div>
            {live.rating.comment && <div className="mt-1 text-[12px] font-semibold text-brand-muted">"{live.rating.comment}"</div>}
          </div>
        )}
      </div>

      {/* rating sheet */}
      {showRate && order.fbId && onRate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[500] flex items-end justify-center bg-brand-ink/60 backdrop-blur-md sm:items-center"
          onClick={() => setShowRate(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] rounded-t-[28px] bg-white p-6 text-center sm:rounded-[28px]"
          >
            <div className="text-2xl">🙌</div>
            <div className="mt-1 text-[20px] font-black text-brand-ink">
              {isAr ? 'كيف كان طلبك؟' : 'How was your order?'}
            </div>
            <p className="mt-1 text-[12px] font-semibold text-brand-muted">
              {isAr ? 'رأيك يساعدنا نتحسن' : 'Your feedback helps us improve'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <motion.button
                  key={n}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setStars(n)}
                  className="text-3xl transition"
                  style={{ opacity: n <= stars ? 1 : 0.3 }}
                >
                  ⭐️
                </motion.button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={isAr ? 'اكتب رأيك (اختياري)…' : 'Comment (optional)…'}
              rows={2}
              className="mt-4 w-full resize-none rounded-2xl border-2 border-brand-line bg-brand-cream px-4 py-3 text-[13px] font-semibold text-brand-ink outline-none placeholder:text-brand-muted focus:border-brand-red"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowRate(false)}
                className="flex-1 rounded-2xl border-2 border-brand-line bg-white py-3 text-[13px] font-black text-brand-ink2"
              >
                {isAr ? 'لاحقاً' : 'Later'}
              </button>
              <button
                onClick={submitRating}
                className="flex-1 rounded-2xl bg-brand-red py-3 text-[13px] font-black text-white shadow-red"
              >
                {isAr ? 'إرسال' : 'Submit'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
