import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FB } from '../lib/fb';

type Ann = { active: boolean; text: string; textAr: string; kind?: string } | null;

const KIND_STYLES: Record<string, { bg: string; fg: string; border: string; icon: string }> = {
  info:    { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE', icon: 'ℹ️' },
  success: { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0', icon: '✅' },
  warning: { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A', icon: '⚠️' },
  promo:   { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA', icon: '🎁' },
};

export default function AnnouncementBanner({ isAr }: { isAr: boolean }) {
  const [ann, setAnn] = useState<Ann>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Skip while offline / no Firestore access — page still renders.
    (async () => {
      const cur = await FB.getAnnouncement();
      if (cur) setAnn(cur as Ann);
    })();
    const unsub = FB.onAnnouncementChange((next) => {
      setAnn(next as Ann);
      // A fresh announcement re-shows even if the user dismissed the old one
      setDismissed(false);
    });
    return () => unsub();
  }, []);

  const visible = ann && ann.active && !dismissed && (ann.text || ann.textAr);
  const s = (ann && KIND_STYLES[ann.kind || 'info']) || KIND_STYLES.info;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          className="sticky top-[62px] z-[78] px-4 pt-2"
        >
          <div
            className="mx-auto flex max-w-[640px] items-start gap-2 rounded-2xl border px-3 py-2.5 shadow-soft"
            style={{ background: s.bg, borderColor: s.border, color: s.fg }}
          >
            <span className="mt-0.5 text-base">{s.icon}</span>
            <div className="flex-1 text-[12.5px] font-black leading-snug">
              {(isAr && ann?.textAr) || ann?.text || ''}
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-lg leading-none opacity-60 transition hover:opacity-100"
              style={{ color: s.fg }}
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
