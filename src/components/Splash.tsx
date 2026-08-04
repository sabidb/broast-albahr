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
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-brand-cream"
    >
      {/* warm glow orbs */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-50vmax] h-[140vmax] w-[140vmax] animate-splashOrb"
        style={{
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(245,166,35,0.35), transparent 60%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-[-30vmax] right-[-20vmax] h-[70vmax] w-[70vmax] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(225,6,0,0.12), transparent 65%)' }}
      />
      <motion.img
        src={LOGO_SRC}
        alt="Broast Albahr"
        initial={{ scale: 0.6, y: 22, opacity: 0, filter: 'blur(7px)' }}
        animate={{ scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: [0.2, 0.9, 0.25, 1] }}
        className="relative z-10 w-[168px] rounded-[30px] animate-logoFloat ring-4 ring-white"
        style={{ boxShadow: '0 30px 60px rgba(225,6,0,0.28)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.6 }}
        className="heading-shine relative z-10 mt-7 text-[30px] font-black tracking-tight"
      >
        BROAST ALBAHR
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="relative z-10 mt-1 font-arabic text-lg font-extrabold text-brand-ink"
      >
        بروست البحر
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.6 }}
        className="relative z-10 mt-8 flex gap-2.5"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 animate-bounceDot rounded-full bg-brand-red"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
