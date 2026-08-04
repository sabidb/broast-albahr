import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { LOGO_SRC } from '../lib/logo';

export default function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(120% 120% at 50% -10%, #E20800 0%, #B00000 36%, #5c0000 66%, #120202 100%)',
      }}
    >
      {/* pulsing glow orb */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-55vmax] h-[150vmax] w-[150vmax] animate-splashOrb"
        style={{
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(255,212,0,0.18), transparent 60%)',
        }}
      />
      <motion.img
        src={LOGO_SRC}
        alt="Broast Albahr"
        initial={{ scale: 0.6, y: 22, opacity: 0, filter: 'blur(7px)' }}
        animate={{ scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: [0.2, 0.9, 0.25, 1] }}
        className="relative z-10 w-[172px] rounded-[28px] animate-logoFloat"
        style={{
          boxShadow:
            '0 26px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,212,0,0.4), 0 0 60px rgba(255,212,0,0.3)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.6 }}
        className="heading-shine relative z-10 mt-6 font-display text-[26px] font-black tracking-[4px]"
      >
        BROAST ALBAHR
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="relative z-10 mt-1.5 font-arabic text-base font-bold text-white/90"
      >
        بروست البحر
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.6 }}
        className="relative z-10 mt-7 flex gap-2.5"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 animate-bounceDot rounded-full bg-brand-gold"
            style={{ animationDelay: `${i * 0.18}s`, boxShadow: '0 0 14px rgba(255,212,0,0.75)' }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
