import { motion } from 'framer-motion';
import { MILESTONES, nextMilestone, weekFlames, type StreakState } from '../lib/streak';

const DAY_LETTERS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function StreakPanel({ state, isAr }: { state: StreakState; isAr: boolean }) {
  const flames = weekFlames(state.count);
  const next = nextMilestone(state.count);
  // order the last 7 day-letters ending today
  const todayIdx = new Date().getDay();
  const letters = Array.from({ length: 7 }, (_, i) => DAY_LETTERS_EN[(todayIdx - 6 + i + 7) % 7]);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 text-center text-white shadow-[0_14px_34px_rgba(255,90,0,0.3)]"
        style={{ background: 'linear-gradient(140deg,#FF8A00,#FF2D00 70%,#E10600)' }}
      >
        <div style={{ perspective: 700 }}>
          <motion.div
            animate={{ scale: [1, 1.12, 0.97, 1.08, 1], rotate: [0, -5, 5, -3, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="text-[54px] leading-none"
            style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.25))' }}
          >
            🔥
          </motion.div>
        </div>
        <div className="mt-1 font-display text-[42px] font-black leading-none">{state.count}</div>
        <div className="text-sm font-bold opacity-90">
          {isAr ? 'يوم متتالي' : state.count === 1 ? 'day streak' : 'day streak'}
        </div>
      </div>

      {/* week tracker */}
      <div className="card-surface mt-3 p-4">
        <div className="mb-3 text-xs font-black uppercase tracking-wide text-brand-muted">
          {isAr ? 'هذا الأسبوع' : 'This week'}
        </div>
        <div className="flex justify-between">
          {flames.map((lit, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 16 }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[17px]"
                style={{
                  background: lit ? 'linear-gradient(135deg,#FF8A00,#FF2D00)' : '#F1E4D3',
                  filter: lit ? 'drop-shadow(0 4px 8px rgba(255,90,0,0.35))' : 'none',
                }}
              >
                {lit ? '🔥' : '·'}
              </motion.div>
              <span className="text-[10px] font-bold text-brand-muted">{letters[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* stats */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="card-surface p-4 text-center">
          <div className="text-[26px] font-black text-brand-red">{state.best}</div>
          <div className="text-[11px] font-bold text-brand-muted">{isAr ? 'أفضل سلسلة' : 'Best streak'}</div>
        </div>
        <div className="card-surface p-4 text-center">
          <div className="text-[26px] font-black text-brand-red">{state.total}</div>
          <div className="text-[11px] font-bold text-brand-muted">{isAr ? 'إجمالي الأيام' : 'Total days'}</div>
        </div>
      </div>

      {/* rewards ladder */}
      <div className="mt-3 mb-2 text-xs font-black uppercase tracking-wide text-brand-muted">
        {isAr ? 'المكافآت' : 'Rewards'}
      </div>
      <div className="flex flex-col gap-2 pb-2">
        {MILESTONES.map((m) => {
          const done = state.count >= m.days;
          const isNext = next?.days === m.days;
          return (
            <div
              key={m.days}
              className="flex items-center gap-3 rounded-2xl border-2 bg-white p-3"
              style={{
                borderColor: done ? 'rgba(17,132,91,0.4)' : isNext ? 'rgba(225,6,0,0.4)' : 'rgba(30,18,6,0.08)',
                opacity: done || isNext ? 1 : 0.7,
              }}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                style={{ background: done ? 'rgba(17,132,91,0.12)' : 'rgba(225,6,0,0.08)' }}
              >
                {done ? '✅' : m.emoji}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-black text-brand-ink">
                  {m.days} {isAr ? 'أيام' : 'days'} · {m.label}
                </div>
                <div className="text-[11px] font-bold text-brand-muted">
                  {isAr ? 'الرمز' : 'Code'}:{' '}
                  <span className="font-mono text-brand-red">{m.code}</span>
                </div>
              </div>
              {isNext && (
                <span className="rounded-full bg-brand-red/10 px-2 py-1 text-[10px] font-black text-brand-red">
                  {isAr ? `باقي ${m.days - state.count}` : `${m.days - state.count} to go`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
