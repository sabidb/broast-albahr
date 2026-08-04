import { useRef } from 'react';
import { motion, useMotionValue, useMotionTemplate, useSpring, useTransform } from 'framer-motion';
import { item as itemVar } from './motion';
import FoodIcon from './FoodIcon';
import { detectKind, kindGradient } from '../lib/items';
import { money } from '../lib/utils';
import type { MenuItem } from '../lib/data';

interface Props {
  item: MenuItem;
  category?: string;
  isAr: boolean;
  qty?: number;
  onOpen: (i: MenuItem) => void;
}

/** Featured product card: 3D tilt + glare, SVG icon, tap to open details. */
export default function MenuCard({ item, category = '', isAr, qty, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const kind = detectKind(item, category);
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
    <motion.button
      ref={ref as any}
      variants={itemVar}
      onClick={() => onOpen(item)}
      onPointerMove={item.available ? onMove : undefined}
      onPointerLeave={reset}
      whileHover={item.available ? { scale: 1.03 } : undefined}
      style={{ rotateX, rotateY, transformPerspective: 800, transformStyle: 'preserve-3d', opacity: item.available ? 1 : 0.55 }}
      className="card-surface grad-ring relative flex w-full flex-col gap-2 p-3 text-start"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: glareBg, mixBlendMode: 'soft-light', opacity: item.available ? 1 : 0 }}
      />
      <div
        className="relative flex h-24 items-center justify-center rounded-[18px]"
        style={{ background: kindGradient(kind), transform: 'translateZ(24px)' }}
      >
        <FoodIcon kind={kind} size={72} />
        <span className="absolute end-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black text-brand-ink">
          🔥 {item.cal}
        </span>
        {!item.available && (
          <span className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-brand-ink px-3 py-0.5 text-[10px] font-black text-white">
            {isAr ? 'غير متاح' : 'Sold out'}
          </span>
        )}
      </div>
      <div className="flex-1" style={{ transform: 'translateZ(16px)' }}>
        <div className="line-clamp-2 text-[13px] font-black leading-tight text-brand-ink">
          {isAr ? item.nameAr : item.name}
        </div>
      </div>
      <div className="flex items-center justify-between" style={{ transform: 'translateZ(20px)' }}>
        <span className="text-[17px] font-black text-brand-red">{money(item.price)}</span>
        <span className="flex items-center gap-1 rounded-full bg-brand-red/8 px-2.5 py-1 text-[11px] font-black text-brand-red">
          {qty ? `× ${qty}` : isAr ? 'عرض' : 'View'}
        </span>
      </div>
    </motion.button>
  );
}
