import { motion } from 'framer-motion';

/** Header 🔥 streak pill (Snapchat-style). */
export default function StreakBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (count < 1) return null;
  return (
    <motion.button
      onClick={onClick}
      initial={{ scale: 0, rotate: -20 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      whileTap={{ scale: 0.92 }}
      className="relative flex items-center gap-1 rounded-full px-3 py-1.5 shadow-[0_8px_20px_rgba(255,120,0,0.35)]"
      style={{ background: 'linear-gradient(135deg,#FF8A00,#FF2D00)' }}
      aria-label={`${count} day streak`}
    >
      <motion.span
        className="text-[16px] leading-none"
        animate={{ scale: [1, 1.18, 0.95, 1.1, 1], rotate: [0, -6, 6, -3, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 0 6px rgba(255,180,0,0.9))' }}
      >
        🔥
      </motion.span>
      <span className="font-display text-[14px] font-extrabold leading-none text-white">{count}</span>
    </motion.button>
  );
}
