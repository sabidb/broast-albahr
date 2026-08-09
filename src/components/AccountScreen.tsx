import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AiChat from './AiChat';
import ReferralCard from './ReferralCard';
import AddressManager from './AddressManager';
import { tierFor, type LoyaltyState } from '../lib/loyalty';
import type { StreakState } from '../lib/streak';

export default function AccountScreen({
  user,
  loyalty,
  streak,
  isAr,
  onToggleLang,
  onLogout,
}: {
  user: { uid: string; name: string; phone: string };
  loyalty: LoyaltyState;
  streak: StreakState;
  isAr: boolean;
  onToggleLang: () => void;
  onLogout: () => void;
}) {
  const [chat, setChat] = useState(false);
  const [addressesOpen, setAddressesOpen] = useState(false);
  const tier = tierFor(loyalty.lifetime);
  const initial = user.name.trim().charAt(0).toUpperCase() || '🙂';

  const rows: { icon: string; label: string; onClick: () => void; danger?: boolean }[] = [
    { icon: '📍', label: isAr ? 'عناويني المحفوظة' : 'My addresses', onClick: () => setAddressesOpen(true) },
    { icon: '🌐', label: isAr ? 'اللغة: English' : 'Language: عربي', onClick: onToggleLang },
    { icon: '💬', label: isAr ? 'المساعد الذكي' : 'AI Assistant', onClick: () => setChat(true) },
    { icon: '🚪', label: isAr ? 'تسجيل الخروج' : 'Log out', onClick: onLogout, danger: true },
  ];

  if (chat) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pb-32 pt-5">
        <button onClick={() => setChat(false)} className="mb-3 text-sm font-black text-brand-red">
          ← {isAr ? 'رجوع' : 'Back'}
        </button>
        <div className="rounded-3xl bg-white p-4 shadow-soft ring-1 ring-brand-line">
          <AiChat isAr={isAr} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-32 pt-5">
      {/* profile */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 rounded-[28px] bg-white p-5 shadow-soft ring-1 ring-brand-line"
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-3xl text-2xl font-black text-white shadow-red"
          style={{ background: 'linear-gradient(135deg,#E10600,#FF5A1F)' }}
        >
          {initial}
        </div>
        <div className="flex-1">
          <div className="text-lg font-black text-brand-ink">{user.name}</div>
          <div className="text-[13px] font-bold text-brand-muted">{user.phone}</div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[11px] font-black text-brand-goldDeep">
            {tier.emoji} {isAr ? tier.nameAr : tier.name}
          </div>
        </div>
      </motion.div>

      {/* quick stats */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          [isAr ? 'النقاط' : 'Points', loyalty.points, '🎁'],
          [isAr ? 'السلسلة' : 'Streak', streak.count, '🔥'],
          [isAr ? 'مدى الحياة' : 'Lifetime', loyalty.lifetime, '⭐'],
        ].map(([l, v, ic], i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 18, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 0.9, 0.28, 1] }}
            className="rounded-3xl bg-white p-4 text-center shadow-soft ring-1 ring-brand-line"
          >
            <div className="text-xl">{ic as string}</div>
            <div className="mt-1 text-[22px] font-black text-brand-red">{v as number}</div>
            <div className="text-[10px] font-bold text-brand-muted">{l as string}</div>
          </motion.div>
        ))}
      </div>

      {/* settings */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.45, ease: [0.22, 0.9, 0.28, 1] }}
        className="mt-4 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-brand-line"
      >
        {rows.map((r, i) => (
          <button
            key={i}
            onClick={r.onClick}
            className="flex w-full items-center gap-3 border-b border-brand-line px-4 py-3.5 text-start last:border-b-0"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-cream text-base">{r.icon}</div>
            <span className={`flex-1 text-[14px] font-black ${r.danger ? 'text-brand-red' : 'text-brand-ink'}`}>
              {r.label}
            </span>
            <span className="text-brand-muted">›</span>
          </button>
        ))}
      </motion.div>

      <ReferralCard phone={user.phone} isAr={isAr} />

      <div className="mt-6 text-center text-[11px] font-bold text-brand-muted">
        Broast Al Bahr · بروست البحر
      </div>

      <AnimatePresence>
        {addressesOpen && (
          <AddressManager uid={user.uid} isAr={isAr} onClose={() => setAddressesOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
