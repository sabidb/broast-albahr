import { useRef, useState } from 'react';
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

const faceBase =
  'card-surface absolute inset-0 flex flex-col gap-2 p-4 [backface-visibility:hidden] [transform-style:preserve-3d]';

/** Menu card: pointer-driven 3D tilt + glare, and a 3D flip to a details back. */
export default function MenuCard({ item, isAr, qty, onAdd, onRemove, onAddClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 220, damping: 18, mass: 0.4 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [11, -11]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-13, 13]), spring);
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
      style={{ rotateX, rotateY, transformPerspective: 800, transformStyle: 'preserve-3d', opacity: item.available ? 1 : 0.55 }}
      className="relative h-[200px]"
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        {/* ── FRONT ── */}
        <div className={`${faceBase} grad-ring`}>
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
          <div className="flex items-start justify-between" style={{ transform: 'translateZ(26px)' }}>
            <motion.span
              className="text-[36px] leading-none drop-shadow"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              {item.emoji}
            </motion.span>
            <button
              onClick={() => setFlipped(true)}
              aria-label="details"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-cream2 text-xs font-black text-brand-ink2"
            >
              ℹ️
            </button>
          </div>
          <div className="flex-1 overflow-hidden" style={{ transform: 'translateZ(16px)' }}>
            <div className="line-clamp-2 text-[14px] font-black leading-tight text-brand-ink">
              {isAr ? item.nameAr : item.name}
            </div>
            <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-brand-muted">
              {isAr ? item.name : item.nameAr}
            </div>
          </div>
          <div className="flex items-center justify-between" style={{ transform: 'translateZ(22px)' }}>
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
        </div>

        {/* ── BACK ── */}
        <div
          className={`${faceBase} items-center justify-center text-center`}
          style={{ transform: 'rotateY(180deg)', background: 'linear-gradient(160deg,#fff,#FFF1E0)' }}
        >
          <button
            onClick={() => setFlipped(false)}
            aria-label="back"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand-cream2 text-xs font-black text-brand-ink2"
          >
            ↩
          </button>
          <div className="text-[40px]">{item.emoji}</div>
          <div className="line-clamp-2 text-[13px] font-black text-brand-ink">{isAr ? item.nameAr : item.name}</div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-brand-muted">
            <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-brand-goldDeep">{item.cal}</span>
            <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-brand-green">
              {isAr ? '١٠٠٪ حلال' : '100% Halal'}
            </span>
          </div>
          <p className="px-2 text-[11px] font-semibold text-brand-muted">
            {isAr ? 'طازج يومياً · يُحضّر عند الطلب 🔥' : 'Fresh daily · made to order 🔥'}
          </p>
          {item.available && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                onAddClick(item);
                setFlipped(false);
              }}
              className="mt-1 rounded-xl bg-brand-red px-5 py-1.5 text-xs font-black text-white shadow-red"
            >
              {money(item.price)} · {isAr ? 'أضف' : 'Add'}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
