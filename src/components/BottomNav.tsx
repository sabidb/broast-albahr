import { motion } from 'framer-motion';

export type Tab = 'menu' | 'rewards' | 'orders' | 'account';

const TABS: { id: Tab; en: string; ar: string; icon: string }[] = [
  { id: 'menu', en: 'Menu', ar: 'القائمة', icon: '🍗' },
  { id: 'rewards', en: 'Rewards', ar: 'مكافآت', icon: '🎁' },
  { id: 'orders', en: 'Orders', ar: 'طلباتي', icon: '🧾' },
  { id: 'account', en: 'Account', ar: 'حسابي', icon: '👤' },
];

export default function BottomNav({
  active,
  onChange,
  isAr,
  streak,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  isAr: boolean;
  streak: number;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center justify-between rounded-[26px] bg-white/90 px-2 py-2 shadow-[0_10px_40px_rgba(180,60,0,0.18)] ring-1 ring-brand-line backdrop-blur-xl">
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-3xl py-2"
            >
              {on && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-3xl"
                  style={{ background: 'linear-gradient(135deg,#E10600,#FF5A1F)' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <div className="relative">
                <motion.span
                  animate={on ? { y: -1, scale: 1.12 } : { y: 0, scale: 1 }}
                  className="block text-[19px] leading-none"
                >
                  {t.icon}
                </motion.span>
                {t.id === 'rewards' && streak > 0 && (
                  <span className="absolute -right-2 -top-1.5 rounded-full bg-brand-ink px-1 text-[9px] font-black text-white">
                    🔥{streak}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] font-black"
                style={{ color: on ? '#fff' : '#B7A895' }}
              >
                {isAr ? t.ar : t.en}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
