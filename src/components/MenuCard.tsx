import { useRef } from 'react';
import { motion, useMotionValue, useMotionTemplate, useSpring, useTransform } from 'framer-motion';
import { item as itemVar } from './motion';
import { money } from '../lib/utils';
import type { MenuItem } from '../lib/data';

interface Props {
  item: MenuItem;
  isAr: boolean;
  qty?: number;
  onAdd: (i: MenuItem) => void;
  onRemove: (id: string | number) => void;
  onAddClick: (i: MenuItem) => void;
}

/** A menu product card with a real pointer-driven 3D tilt + glare. */
export default function MenuCard({ item, isAr, qty, onAdd, onRemove, onAddClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0); // -0.5 .. 0.5
  const py = useMotionValue(0);
  const spring = { stiffness: 220, damping: 18, mass: 0.4 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [12, -12]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-14, 14]), spring);
  const glareX = useTransform(px, [-0.5, 0.5], ['0%', '100%']);
  const glareY = useTransform(py, [-0.5, 0.5], ['0%', '100%']);
  const glareBg = useMotionTemplate`radial-gradient(120px 120px at ${glareX} ${glareY}, rgba(255,255,255,0.5), transparent 60%)`;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <motion.div
      ref={ref}
      variants={itemVar}
      onPointerMove={item.available ? onMove : undefined}
      onPointerLeave={reset}
      whileHover={item.available ? { scale: 1.03 } : undefined}
      whileTap={item.available ? { scale: 0.98 } : undefined}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 700,
        transformStyle: 'preserve-3d',
        opacity: item.available ? 1 : 0.55,
      }}
      className="card-surface grad-ring relative flex flex-col gap-2 p-4"
    >
      {/* moving glare */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: glareBg, mixBlendMode: 'soft-light', opacity: item.available ? 1 : 0 }}
      />

      {!item.available && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center rounded-3xl bg-white/60 backdrop-blur-[1px]">
          <span className="rounded-full bg-brand-ink px-3.5 py-1 text-xs font-black text-white">
            {isAr ? 'غير متاح' : 'Unavailable'}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between" style={{ transform: 'translateZ(28px)' }}>
        <motion.span
          className="text-[36px] leading-none drop-shadow"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          {item.emoji}
        </motion.span>
        <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-black text-brand-goldDeep">
          {item.cal}
        </span>
      </div>

      <div className="flex-1" style={{ transform: 'translateZ(18px)' }}>
        <div className="text-[14px] font-black leading-tight text-brand-ink">
          {isAr ? item.nameAr : item.name}
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-brand-muted">
          {isAr ? item.name : item.nameAr}
        </div>
      </div>

      <div className="flex items-center justify-between" style={{ transform: 'translateZ(24px)' }}>
        <span className="text-[19px] font-black text-brand-red">{money(item.price)}</span>
        {item.available &&
          (qty ? (
            <div className="flex items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => onRemove(item.id)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-cream2 text-lg font-black text-brand-ink"
              >
                −
              </motion.button>
              <motion.span
                key={qty}
                initial={{ scale: 1.5, rotateX: -90 }}
                animate={{ scale: 1, rotateX: 0 }}
                className="min-w-4 text-center font-black text-brand-ink"
              >
                {qty}
              </motion.span>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => onAdd(item)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-red text-lg font-black text-white shadow-red"
              >
                +
              </motion.button>
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.9, rotateX: 18 }}
              whileHover={{ y: -1 }}
              onClick={() => onAddClick(item)}
              className="rounded-xl border-2 border-brand-red bg-white px-4 py-1.5 text-xs font-black text-brand-red transition hover:bg-brand-red hover:text-white"
            >
              {isAr ? 'أضف' : 'Add'}
            </motion.button>
          ))}
      </div>
    </motion.div>
  );
}
