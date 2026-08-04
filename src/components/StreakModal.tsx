import { motion } from 'framer-motion';
import { nextMilestone, type StreakTick } from '../lib/streak';

/** Snapchat-style celebration shown on the first open of a new day. */
export default function StreakModal({
  tick,
  isAr,
  onClose,
}: {
  tick: StreakTick;
  isAr: boolean;
  onClose: () => void;
}) {
  const { state, reset, milestone } = tick;
  const next = nextMilestone(state.count);
  const toNext = next ? next.days - state.count : 0;

  const flames = Array.from({ length: 5 });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[600] flex items-center justify-center bg-brand-ink/55 p-5 backdrop-blur-sm"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.7, y: 40, rotateX: 25 }}
        animate={{ scale: 1, y: 0, rotateX: 0 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        style={{ transformPerspective: 1000 }}
        className="relative w-full max-w-[360px] overflow-hidden rounded-[30px] bg-white p-7 text-center shadow-[0_30px_70px_rgba(255,90,0,0.35)]"
      >
        {/* floating flame confetti */}
        {flames.map((_, i) => (
          <motion.span
            key={i}
            className="pointer-events-none absolute text-2xl"
            style={{ left: `${8 + i * 20}%`, top: '8%' }}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: [0, 260], opacity: [0, 1, 0], rotate: [0, 90 + i * 40] }}
            transition={{ duration: 2.2, delay: i * 0.12, repeat: Infinity, repeatDelay: 1.2 }}
          >
            🔥
          </motion.span>
        ))}

        <div style={{ perspective: 700 }}>
          <motion.div
            animate={{ rotateY: [0, 360], scale: [1, 1.08, 1] }}
            transition={{ rotateY: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }, scale: { duration: 1.2, repeat: Infinity } }}
            className="mx-auto mb-1 text-[76px] leading-none"
            style={{ filter: 'drop-shadow(0 8px 20px rgba(255,120,0,0.5))' }}
          >
            🔥
          </motion.div>
        </div>

        <div className="font-display text-[46px] font-black leading-none text-transparent"
          style={{ backgroundImage: 'linear-gradient(135deg,#FF8A00,#FF2D00)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
          {state.count}
        </div>
        <div className="mt-1 text-lg font-black text-brand-ink">
          {reset
            ? isAr ? 'بدأنا من جديد! 🔥' : 'Fresh start! 🔥'
            : isAr ? `${state.count} أيام متتالية!` : `${state.count}-Day Streak!`}
        </div>
        <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] font-semibold text-brand-muted">
          {isAr
            ? 'افتح التطبيق كل يوم للحفاظ على السلسلة واحصل على مكافآت 🎁'
            : 'Open the app every day to keep your streak and unlock rewards 🎁'}
        </p>

        {milestone ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 260, damping: 16 }}
            className="mt-4 rounded-2xl border-2 border-dashed border-brand-red/40 bg-brand-red/5 p-4"
          >
            <div className="text-sm font-black text-brand-red">
              {milestone.emoji} {isAr ? 'مكافأة مفتوحة!' : 'Reward unlocked!'}
            </div>
            <div className="mt-1 text-[13px] font-bold text-brand-ink2">
              {isAr ? `استخدم الرمز` : 'Use code'}{' '}
              <span className="rounded-md bg-brand-ink px-2 py-0.5 font-mono text-white">{milestone.code}</span>{' '}
              — {milestone.label}
            </div>
          </motion.div>
        ) : (
          next && (
            <div className="mt-4 rounded-2xl bg-brand-cream2 p-3.5">
              <div className="text-[13px] font-bold text-brand-ink2">
                {isAr
                  ? `${toNext} ${toNext === 1 ? 'يوم' : 'أيام'} حتى ${next.emoji} ${next.label}`
                  : `${toNext} more ${toNext === 1 ? 'day' : 'days'} → ${next.emoji} ${next.label}`}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg,#FF8A00,#FF2D00)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (state.count / next.days) * 100)}%` }}
                  transition={{ delay: 0.3, duration: 0.7 }}
                />
              </div>
            </div>
          )
        )}

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onClose}
          className="sheen mt-5 w-full rounded-2xl bg-brand-red py-3.5 text-[15px] font-black text-white shadow-red"
        >
          {isAr ? 'رائع! 🔥' : "Let's go! 🔥"}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
