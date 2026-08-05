import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BRANCHES, type Branch } from '../lib/data';
import { calcDistance } from '../lib/utils';

interface Props {
  isAr: boolean;
  onSelect: (branchId: string) => void;
  onBack?: () => void;
}

const listStagger = { animate: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const cardVar = {
  initial: { opacity: 0, y: 24, scale: 0.94 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 22 } },
};

export default function BranchSelectStep({ isAr, onSelect, onBack }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [nearest, setNearest] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle');

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    setGeoStatus('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        let best: Branch | null = null;
        let bestKm = Infinity;
        BRANCHES.forEach((b) => {
          const km = calcDistance(pos.coords.latitude, pos.coords.longitude, b.lat, b.lng);
          if (km < bestKm) {
            bestKm = km;
            best = b;
          }
        });
        if (best) setNearest(best.id);
        setGeoStatus('ok');
      },
      () => setGeoStatus('denied'),
      { timeout: 6000, maximumAge: 1000 * 60 * 10 },
    );
  }, []);

  const confirm = () => {
    if (!picked) return;
    try {
      localStorage.setItem('ba_branch', picked);
    } catch {}
    onSelect(picked);
  };

  return (
    <div className="ambient min-h-[100dvh] px-5 pb-32 pt-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-[520px]">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-lg text-brand-ink shadow-soft"
          >
            ←
          </button>
        )}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-1 text-[13px] font-bold text-brand-muted">
          {isAr ? '👋 مرحباً بك' : '👋 Welcome'}
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-[28px] font-black leading-tight text-brand-ink"
        >
          {isAr ? 'اختر الفرع الأقرب لك' : 'Pick a branch to order from'}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mt-1.5 text-[13px] font-semibold text-brand-muted"
        >
          {geoStatus === 'asking'
            ? isAr
              ? 'نتحقق من موقعك…'
              : 'Finding the nearest branch…'
            : geoStatus === 'ok'
              ? isAr
                ? 'الفرع الأقرب مميّز بشارة.'
                : 'Nearest branch is tagged for you.'
              : isAr
                ? 'اختر الفرع يدوياً.'
                : 'Choose any branch below.'}
        </motion.p>

        <motion.div variants={listStagger} initial="initial" animate="animate" className="mt-6 flex flex-col gap-3">
          {BRANCHES.map((b) => {
            const isPicked = picked === b.id;
            const isNear = nearest === b.id;
            return (
              <motion.button
                key={b.id}
                variants={cardVar}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPicked(b.id)}
                className="relative w-full overflow-hidden rounded-[24px] border-2 bg-white p-4 text-start shadow-card transition"
                style={{ borderColor: isPicked ? '#E10600' : 'rgba(30,18,6,0.10)' }}
              >
                {isNear && (
                  <span className="absolute end-3 top-3 rounded-full bg-brand-green px-2.5 py-0.5 text-[10px] font-black text-white shadow">
                    📍 {isAr ? 'الأقرب' : 'NEAREST'}
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
                    style={{ background: isPicked ? 'linear-gradient(135deg,#E10600,#FF5A1F)' : '#FBEBD7' }}
                  >
                    <span className={isPicked ? 'text-white' : ''}>🍗</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[16px] font-black text-brand-ink">
                      {isAr ? b.nameAr : b.nameEn}
                    </div>
                    <div className="mt-0.5 text-[12px] font-semibold text-brand-muted">
                      {isAr ? 'مكة المكرمة' : 'Makkah'} · {b.whatsapp.replace(/^966/, '+966 ')}
                    </div>
                  </div>
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition"
                    style={{
                      borderColor: isPicked ? '#E10600' : 'rgba(30,18,6,0.20)',
                      background: isPicked ? '#E10600' : '#fff',
                    }}
                  >
                    {isPicked && <span className="text-[12px] font-black text-white">✓</span>}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: picked ? 0 : 40, opacity: picked ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="fixed inset-x-0 z-[80] mx-auto w-[calc(100%-2rem)] max-w-[420px]"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', pointerEvents: picked ? 'auto' : 'none' }}
      >
        <button
          onClick={confirm}
          className="sheen w-full rounded-[22px] py-4 text-[16px] font-black text-white shadow-red"
          style={{ background: 'linear-gradient(135deg,#E10600,#FF5A1F)' }}
        >
          {isAr ? 'متابعة للقائمة →' : 'Continue to Menu →'}
        </button>
      </motion.div>
    </div>
  );
}
