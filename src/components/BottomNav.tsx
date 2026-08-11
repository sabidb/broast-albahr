import { motion, LayoutGroup } from 'framer-motion';
import type { Tab } from './App';

interface Props {
  active: Tab;
  isAr: boolean;
  ordersCount?: number;
  points?: number;
  onChange: (t: Tab) => void;
}

interface TabDef {
  id: Tab;
  labelEn: string;
  labelAr: string;
  icon: JSX.Element;
}

const iconStroke = 'currentColor';

const HomeIcon = (
  <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden>
    <path d="M4 11.3 12 5l8 6.3V19a1.7 1.7 0 0 1-1.7 1.7h-3.1v-5.1h-4.4v5.1H5.7A1.7 1.7 0 0 1 4 19v-7.7Z"
      stroke={iconStroke} strokeWidth="1.7" strokeLinejoin="round" fill="none" />
  </svg>
);
const OrdersIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <path d="M6 3h10.5L20 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20V4.5A1.5 1.5 0 0 1 6 3Z"
      stroke={iconStroke} strokeWidth="1.7" strokeLinejoin="round" fill="none" />
    <path d="M8 10h8M8 13.5h8M8 17h5" stroke={iconStroke} strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const RewardsIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <path d="M4 8.5h16v3H4zM5.5 11.5h13V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20v-8.5Z"
      stroke={iconStroke} strokeWidth="1.7" strokeLinejoin="round" fill="none" />
    <path d="M12 8.5v13M8.5 5.5A2 2 0 0 1 12 5.7 2 2 0 0 1 15.5 5.5c0 1.5-1.7 3-3.5 3s-3.5-1.5-3.5-3Z"
      stroke={iconStroke} strokeWidth="1.7" strokeLinejoin="round" fill="none" />
  </svg>
);
const AccountIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <circle cx="12" cy="8.5" r="3.5" stroke={iconStroke} strokeWidth="1.7" fill="none" />
    <path d="M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5"
      stroke={iconStroke} strokeWidth="1.7" strokeLinecap="round" fill="none" />
  </svg>
);

export default function BottomNav({ active, isAr, ordersCount = 0, points = 0, onChange }: Props) {
  const tabs: TabDef[] = [
    { id: 'menu',    labelEn: 'Home',    labelAr: 'الرئيسية',  icon: HomeIcon },
    { id: 'orders',  labelEn: 'Orders',  labelAr: 'طلباتي',   icon: OrdersIcon },
    { id: 'rewards', labelEn: 'Rewards', labelAr: 'المكافآت',  icon: RewardsIcon },
    { id: 'account', labelEn: 'Account', labelAr: 'حسابي',    icon: AccountIcon },
  ];

  return (
    <div
      className="bottom-nav fixed inset-x-0 z-[90] mx-auto flex justify-center px-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <nav
        role="navigation"
        aria-label={isAr ? 'التنقّل' : 'Navigation'}
        className="glass flex w-full max-w-[440px] items-stretch justify-between rounded-[26px] border border-brand-line px-2 py-1.5 shadow-[0_18px_40px_rgba(180,60,0,0.16)]"
      >
        <LayoutGroup id="bottom-nav">
          {tabs.map((t) => {
            const on = active === t.id;
            const badge =
              t.id === 'orders' && ordersCount > 0
                ? ordersCount > 99 ? '99+' : String(ordersCount)
                : t.id === 'rewards' && points > 0
                  ? points > 999 ? '999+' : String(points)
                  : null;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                aria-label={isAr ? t.labelAr : t.labelEn}
                aria-current={on ? 'page' : undefined}
                className="relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 py-1.5"
                style={{ color: on ? '#E10600' : '#8C7A64' }}
              >
                {on && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-[20px]"
                    style={{ background: 'rgba(225,6,0,0.10)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <div className="relative">
                  {t.icon}
                  {badge && (
                    <span className="absolute -end-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-black text-white shadow-[0_2px_6px_rgba(225,6,0,0.4)]">
                      {badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-black tracking-wide">
                  {isAr ? t.labelAr : t.labelEn}
                </span>
              </button>
            );
          })}
        </LayoutGroup>
      </nav>
    </div>
  );
}
