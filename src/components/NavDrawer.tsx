import { motion } from 'framer-motion';
import { tierFor, type LoyaltyState } from '../lib/loyalty';
import type { StreakState } from '../lib/streak';
import type { Tab } from './App';

export default function NavDrawer({
  user,
  loyalty,
  streak,
  active,
  isAr,
  onNavigate,
  onToggleLang,
  onAdmin,
  onLogout,
  onClose,
}: {
  user: { name: string; phone: string };
  loyalty: LoyaltyState;
  streak: StreakState;
  active: Tab;
  isAr: boolean;
  onNavigate: (t: Tab) => void;
  onToggleLang: () => void;
  onAdmin: () => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const tier = tierFor(loyalty.lifetime);
  const initial = user.name.trim().charAt(0).toUpperCase() || '🙂';
  const hiddenX = isAr ? '100%' : '-100%';

  // Everything EXCEPT "My Orders" lives here.
  const nav: { id: Tab; icon: string; label: string }[] = [
    { id: 'menu', icon: '🍗', label: isAr ? 'القائمة' : 'Menu' },
    { id: 'rewards', icon: '🎁', label: isAr ? 'المكافآت والنقاط' : 'Rewards & Points' },
    { id: 'account', icon: '👤', label: isAr ? 'حسابي' : 'My Account' },
  ];
  const actions = [
    { icon: '🌐', label: isAr ? 'English' : 'عربي', onClick: onToggleLang, danger: false },
    { icon: '⚙️', label: isAr ? 'لوحة الإدارة' : 'Admin panel', onClick: onAdmin, danger: false },
    { icon: '🚪', label: isAr ? 'تسجيل الخروج' : 'Log out', onClick: onLogout, danger: true },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[250] bg-brand-ink/40 backdrop-blur-sm"
    >
      <motion.aside
        onClick={(e) => e.stopPropagation()}
        initial={{ x: hiddenX }}
        animate={{ x: 0 }}
        exit={{ x: hiddenX }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="absolute inset-y-0 start-0 flex w-[84%] max-w-[340px] flex-col bg-brand-cream shadow-[0_0_60px_rgba(0,0,0,0.25)]"
      >
        {/* profile header */}
        <div className="relative overflow-hidden px-5 pb-5 pt-6 text-white" style={{ background: 'linear-gradient(140deg,#E10600,#FF5A1F)' }}>
          <button onClick={onClose} className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20 text-lg">
            ✕
          </button>
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/25 text-2xl font-black">
            {initial}
          </div>
          <div className="mt-3 text-lg font-black">{user.name}</div>
          <div className="text-[13px] font-bold opacity-90">{user.phone}</div>
          <div className="mt-2 flex gap-2">
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black">
              {tier.emoji} {isAr ? tier.nameAr : tier.name}
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black">🎁 {loyalty.points}</span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black">🔥 {streak.count}</span>
          </div>
        </div>

        {/* nav */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {nav.map((n) => {
            const on = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => {
                  onNavigate(n.id);
                  onClose();
                }}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-start transition"
                style={{ background: on ? '#E10600' : 'transparent', color: on ? '#fff' : '#1E1206' }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg shadow-soft">
                  {n.icon}
                </span>
                <span className="flex-1 text-[15px] font-black">{n.label}</span>
                <span style={{ opacity: on ? 1 : 0.4 }}>›</span>
              </button>
            );
          })}

          <div className="my-3 h-px bg-brand-line" />

          {actions.map((a, i) => (
            <button
              key={i}
              onClick={() => {
                a.onClick();
                if (a.danger || a.icon === '⚙️') onClose();
              }}
              className="flex items-center gap-3 rounded-2xl px-3 py-3 text-start"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg shadow-soft">
                {a.icon}
              </span>
              <span className={`flex-1 text-[15px] font-black ${a.danger ? 'text-brand-red' : 'text-brand-ink'}`}>
                {a.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="px-5 pb-5 pt-2 text-center text-[11px] font-bold text-brand-muted">
          Broast Al Bahr · بروست البحر · v2.0
        </div>
      </motion.aside>
    </motion.div>
  );
}
