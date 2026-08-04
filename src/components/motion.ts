import type { Variants, Transition } from 'framer-motion';

export const easeOut: Transition = { type: 'spring', stiffness: 260, damping: 26 };
export const soft: Transition = { duration: 0.45, ease: [0.22, 0.9, 0.28, 1] };

/** Step/page transitions (menu ↔ checkout ↔ success) with a 3D depth flip. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 28, rotateX: 10, transformPerspective: 1200 },
  animate: { opacity: 1, y: 0, rotateX: 0, transformPerspective: 1200, transition: soft },
  exit: { opacity: 0, y: -20, rotateX: -8, transformPerspective: 1200, transition: { duration: 0.25 } },
};

/** Container that staggers its children in. */
export const stagger: Variants = {
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Individual card / row entrance. */
export const item: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: soft },
};

/** Bottom-sheet slide up. */
export const sheet: Variants = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { type: 'spring', stiffness: 320, damping: 34 } },
  exit: { y: '100%', transition: { duration: 0.25 } },
};

/** Side drawer slide in (from inline-end). */
export const drawer: Variants = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { type: 'spring', stiffness: 300, damping: 34 } },
  exit: { x: '100%', transition: { duration: 0.25 } },
};

export const pop: Variants = {
  initial: { opacity: 0, scale: 0.82 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 18 } },
};

export const tap = { scale: 0.95 };
export const liftHover = { y: -4 };
