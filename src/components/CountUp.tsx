import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';

/** Springy count-up number driven by a Framer motion value. */
export default function CountUp({
  value,
  format,
  className,
  duration = 0.9,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => (format ? format(v) : Math.round(v).toLocaleString()));

  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.22, 0.9, 0.28, 1] });
    return () => controls.stop();
  }, [value, duration, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
