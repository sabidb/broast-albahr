import { useState } from 'react';
import { motion } from 'framer-motion';
import { referralCodeFor, shareCopy } from '../lib/referral';

interface ReferralRow {
  id: string;
  status: string;
  refereePhone?: string;
  qualifiedAt?: string;
}

/**
 * Referral share card. Prefers the server-minted code when it's landed
 * (phase 14 lookups); falls back to the deterministic phone-hash so the
 * card renders on first paint before the callable roundtrip resolves.
 * Once serverCode is available it also shows live conversion stats.
 */
export default function ReferralCard({
  phone,
  isAr,
  serverCode,
  referrals,
}: {
  phone: string;
  isAr: boolean;
  serverCode?: string | null;
  referrals?: ReferralRow[];
}) {
  const code = serverCode || referralCodeFor(phone);
  const [copied, setCopied] = useState(false);

  const qualified = (referrals || []).filter((r) => r.status === 'qualified').length;
  const pending = (referrals || []).filter((r) => r.status === 'pending').length;

  const doShare = async () => {
    const s = shareCopy(code, isAr);
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: s.title, text: s.text, url: s.url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(`${s.text}\n${s.url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      className="mt-4 overflow-hidden rounded-[28px] p-5 text-white shadow-red"
      style={{ background: 'linear-gradient(135deg,#E10600 0%,#FF5A1F 100%)' }}
    >
      <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/90">
        🎁 {isAr ? 'ادعُ صديقاً' : 'Refer a friend'}
      </div>
      <div className="mt-1.5 text-[19px] font-black leading-tight">
        {isAr ? 'اربح نقاط — وصديقك كذلك' : 'You both get bonus points'}
      </div>
      <p className="mt-1 text-[12px] font-semibold text-white/85">
        {isAr
          ? 'شارك رمزك مع أصدقائك. عندما يطلبون لأول مرة، تُضاف نقاطك تلقائياً.'
          : 'Share your code. When a friend places their first qualifying order, your points top up automatically.'}
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/15 p-2">
        <div className="flex-1 rounded-xl bg-white px-3 py-2 text-center font-display text-[22px] font-black tracking-[0.25em] text-brand-red">
          {code}
        </div>
        <button
          onClick={doShare}
          className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-black text-brand-red shadow-red"
        >
          {copied ? (isAr ? 'تم النسخ ✓' : 'Copied ✓') : isAr ? '📤 مشاركة' : '📤 Share'}
        </button>
      </div>

      {/* Conversion stats — only when the server has landed data.
          Silent when the customer hasn't referred anybody yet, so a
          zero-state doesn't nag a brand-new user. */}
      {(qualified > 0 || pending > 0) && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/15 px-3 py-2 text-[12px] font-black text-white">
          <span>
            ✅ {qualified} {isAr ? 'مؤهلة' : 'qualified'}
          </span>
          <span>
            ⏳ {pending} {isAr ? 'بانتظار' : 'pending'}
          </span>
        </div>
      )}
    </motion.div>
  );
}
