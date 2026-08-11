import { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import CountUp from './CountUp';
import {
  REWARDS,
  TIERS,
  tierFor,
  nextTier,
  tierProgress,
  type LoyaltyState,
  type Reward,
} from '../lib/loyalty';
import { weekFlames, type StreakState } from '../lib/streak';
import { FB } from '../lib/fb';

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
      <motion.circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
    </svg>
  );
}

export default function RewardsScreen({
  loyalty,
  streak,
  isAr,
  uid,
  onRedeem,
}: {
  loyalty: LoyaltyState;
  streak: StreakState;
  isAr: boolean;
  /** Phase 11/12 — customer uid to fetch server-side tokens + ledger. */
  uid?: string;
  onRedeem: (r: Reward) => void;
}) {
  // Phase 11 — the customer's AVAILABLE reward codes (issued by the
  // server-side reward engine). Fetched on mount so the screen doesn't need
  // an auth state change to render them.
  const [tokens, setTokens] = useState<Array<{ code: string; label: string; expiresAt: string; kind?: string; value?: number }>>([]);
  // Phase 12 — server-side balance/lifetime + ledger activity, kept in
  // sync live so a redemption on another device deducts here too. Nulls
  // mean "not yet loaded" and the UI falls back to the local cache.
  const [serverBalance,  setServerBalance]  = useState<number | null>(null);
  const [serverLifetime, setServerLifetime] = useState<number | null>(null);
  const [ledger, setLedger] = useState<Array<{ delta: number; reason: string; at: string }>>([]);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const [t, b, hist] = await Promise.all([
        FB.getMyRewardTokens(uid),
        FB.getMyPointsBalance(uid),
        FB.getMyPointsLedger(uid, 20),
      ]);
      if (!alive) return;
      setTokens(t);
      // Trust the server value even when it's zero — that's the whole
      // point of the cross-device sync. The old `if (b > 0)` guard let a
      // stale localStorage balance mask a full redemption.
      setServerBalance(b);
      setLedger(hist);
    })();
    // Live subscription: any customers/{uid} write (order earn, redeem
    // debit, tier recompute) republishes here. Every device stays in sync
    // without a manual refresh.
    const unsub = FB.onCustomerDoc(uid, (d) => {
      if (!d) return;
      const p = Number((d as any).points);
      const l = Number((d as any).lifetimeSpend);
      if (Number.isFinite(p)) setServerBalance(p);
      if (Number.isFinite(l)) setServerLifetime(l);
    });
    return () => { alive = false; unsub(); };
  }, [uid, reloadTick]);

  const shownPoints    = serverBalance  != null ? serverBalance  : loyalty.points;
  const shownLifetime  = serverLifetime != null && serverLifetime > loyalty.lifetime
    ? serverLifetime
    : loyalty.lifetime;
  const tier = tierFor(shownLifetime);
  const nxt  = nextTier(shownLifetime);
  const pct  = tierProgress(shownLifetime);
  const flames = weekFlames(streak.count);

  const handleRedeem = async (r: Reward) => {
    await onRedeem(r);
    // Kick a re-fetch so tokens + ledger repaint immediately; the doc
    // subscription already refreshes the balance.
    setReloadTick((n) => n + 1);
  };

  // parallax on scroll
  const { scrollY } = useScroll();
  const decoY = useTransform(scrollY, [0, 320], [0, -70]);
  const deco2Y = useTransform(scrollY, [0, 320], [0, 50]);

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-40 pt-4">
      {/* points hero — parallax */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_18px_40px_rgba(225,6,0,0.28)]"
        style={{ background: 'linear-gradient(140deg,#E10600,#FF5A1F 70%,#F5A623)' }}
      >
        <motion.div style={{ y: decoY }} className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/20" />
        <motion.div style={{ y: deco2Y }} className="pointer-events-none absolute -left-8 bottom-[-40px] h-28 w-28 rounded-full bg-white/10" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold opacity-90">{isAr ? 'رصيد نقاطك' : 'Your points'}</div>
            <div className="font-display text-[44px] font-black leading-none">
              <CountUp value={shownPoints} />
            </div>

            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-black">
              {tier.emoji} {isAr ? tier.nameAr : tier.name}
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <Ring pct={pct} color="#fff" />
            <div className="absolute text-center">
              <div className="text-[15px] font-black leading-none">{Math.round(pct * 100)}%</div>
            </div>
          </div>
        </div>
        <div className="mt-3 text-[12px] font-bold opacity-90">
          {nxt
            ? isAr
              ? `${Math.max(0, nxt.min - shownLifetime)} نقطة حتى ${nxt.emoji} ${nxt.nameAr}`
              : `${Math.max(0, nxt.min - shownLifetime)} pts to ${nxt.emoji} ${nxt.name}`
            : isAr
              ? 'أعلى مستوى! 💎'
              : 'Top tier reached! 💎'}
        </div>
      </motion.div>

      {/* streak mini */}
      <div className="mt-3 flex items-center gap-3 rounded-3xl bg-white p-4 shadow-soft ring-1 ring-brand-line">
        <div style={{ perspective: 500 }}>
          <motion.div
            animate={{ scale: [1, 1.15, 0.97, 1.08, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="text-[34px]"
          >
            🔥
          </motion.div>
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-black text-brand-ink">
            {streak.count} {isAr ? 'يوم متتالي' : 'day streak'}
          </div>
          <div className="mt-1 flex gap-1">
            {flames.map((lit, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: lit ? 'linear-gradient(135deg,#FF8A00,#FF2D00)' : '#EEE0CE' }}
              />
            ))}
          </div>
        </div>
        <div className="text-end">
          <div className="text-[11px] font-bold text-brand-muted">{isAr ? 'الأفضل' : 'Best'}</div>
          <div className="text-[18px] font-black text-brand-red">{streak.best}</div>
        </div>
      </div>

      {/* Phase 11 — reward codes issued by the server for this customer.
          Each code is a 12-char token that redeems on the next order via
          the Enter Code field on Checkout. Hidden entirely when there are
          none (avoids an empty section for a fresh customer). */}
      {tokens.length > 0 && (
        <>
          <div className="mb-2 mt-6 text-[15px] font-black text-brand-ink">
            🎁 {isAr ? 'رموزك المتاحة' : 'Your reward codes'}
          </div>
          <div className="flex flex-col gap-2">
            {tokens.map((t) => {
              const expDays = t.expiresAt
                ? Math.max(0, Math.floor((new Date(t.expiresAt).getTime() - Date.now()) / 86400000))
                : null;
              return (
                <div
                  key={t.code}
                  className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand-red bg-brand-red/5 p-3"
                >
                  <div className="text-[26px]">🎁</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[15px] font-black tracking-[2px] text-brand-red">{t.code}</div>
                    <div className="mt-0.5 text-[12px] font-bold text-brand-ink2">{t.label}</div>
                    {expDays != null && (
                      <div className="text-[10px] font-bold text-brand-muted">
                        {expDays > 0
                          ? isAr ? `تنتهي خلال ${expDays} يوم` : `expires in ${expDays} day${expDays === 1 ? '' : 's'}`
                          : isAr ? 'تنتهي اليوم' : 'expires today'}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      try { navigator.clipboard?.writeText(t.code); } catch {}
                    }}
                    className="rounded-xl bg-brand-red/10 px-3 py-1.5 text-[11px] font-black text-brand-red"
                    title={isAr ? 'نسخ' : 'Copy'}
                  >
                    {isAr ? 'نسخ' : 'Copy'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* redeem */}
      <div className="mb-2 mt-6 flex items-center justify-between">
        <div className="text-[15px] font-black text-brand-ink">{isAr ? 'استبدل نقاطك 🎁' : 'Redeem points 🎁'}</div>
        <div className="text-[12px] font-bold text-brand-muted">{isAr ? '١ ريال = ١ نقطة' : '1 SR = 1 point'}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {REWARDS.map((r, i) => {
          const can = shownPoints >= r.cost;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              whileInView={{ opacity: can ? 1 : 0.7, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.05, duration: 0.45, ease: [0.22, 0.9, 0.28, 1] }}
              whileHover={{ y: -4 }}
              className="flex flex-col items-center rounded-3xl bg-white p-4 text-center shadow-soft ring-1 ring-brand-line"
            >
              <div className="text-[34px]">{r.emoji}</div>
              <div className="mt-1 text-[14px] font-black text-brand-ink">{isAr ? r.titleAr : r.title}</div>
              <div className="mt-0.5 text-[12px] font-black text-brand-gold">
                {r.cost} {isAr ? 'نقطة' : 'pts'}
              </div>
              <motion.button
                whileTap={can ? { scale: 0.94 } : undefined}
                onClick={() => can && handleRedeem(r)}
                disabled={!can}
                className="mt-3 w-full rounded-2xl py-2 text-xs font-black transition"
                style={{
                  background: can ? '#E10600' : '#F1E4D3',
                  color: can ? '#fff' : '#B7A895',
                  boxShadow: can ? '0 8px 20px rgba(225,6,0,0.3)' : 'none',
                }}
              >
                {can ? (isAr ? 'استبدال' : 'Redeem') : isAr ? `يحتاج ${r.cost - shownPoints}` : `Need ${r.cost - shownPoints}`}
              </motion.button>
            </motion.div>
          );
        })}
      </div>

      {/* tier ladder */}
      <div className="mb-2 mt-6 text-[15px] font-black text-brand-ink">{isAr ? 'المستويات' : 'Tiers'}</div>
      <div className="flex gap-2">
        {TIERS.map((t) => {
          const reached = shownLifetime >= t.min;
          const current = tier.name === t.name;
          return (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              whileInView={{ opacity: reached ? 1 : 0.6, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ delay: TIERS.indexOf(t) * 0.06, type: 'spring', stiffness: 300, damping: 18 }}
              className="flex-1 rounded-2xl border-2 bg-white p-2.5 text-center"
              style={{ borderColor: current ? t.color : 'rgba(30,18,6,0.08)' }}
            >
              <div className="text-[22px]">{t.emoji}</div>
              <div className="text-[11px] font-black text-brand-ink">{isAr ? t.nameAr : t.name}</div>
              <div className="text-[9px] font-bold text-brand-muted">{t.min}+</div>
            </motion.div>
          );
        })}
      </div>

      {/* activity — server ledger when available, local cache otherwise. The
          ledger is the source of truth so redemptions on another device also
          show up here. */}
      {(() => {
        const rows = ledger.length > 0
          ? ledger.map((h) => ({ reason: h.reason, delta: h.delta, key: (h.at || '') + h.reason }))
          : loyalty.history.slice(0, 8).map((h, i) => ({ reason: h.reason, delta: h.delta, key: 'l' + i }));
        if (rows.length === 0) return null;
        return (
          <>
            <div className="mb-2 mt-6 text-[15px] font-black text-brand-ink">{isAr ? 'النشاط' : 'Activity'}</div>
            <div className="flex flex-col gap-2">
              {rows.slice(0, 12).map((h, i) => (
                <motion.div
                  key={h.key}
                  initial={{ opacity: 0, x: 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ delay: i * 0.04, duration: 0.4 }}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 shadow-soft ring-1 ring-brand-line"
                >
                  <span className="text-[12px] font-bold text-brand-ink2">{h.reason}</span>
                  <span className={`text-[13px] font-black ${h.delta >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                    {h.delta >= 0 ? '+' : ''}
                    {h.delta}
                  </span>
                </motion.div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
