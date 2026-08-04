import { motion } from 'framer-motion';

export default function StepBar({ step, isAr }: { step: number; isAr: boolean }) {
  const steps = isAr ? ['التحقق', 'القائمة', 'الدفع'] : ['Verify', 'Menu', 'Checkout'];
  return (
    <div className="flex items-center justify-center gap-0 border-b border-brand-line bg-brand-cream/70 px-5 py-3.5 backdrop-blur">
      {steps.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <motion.div
                animate={active ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-black"
                style={{
                  background: done || active ? '#E10600' : '#FFFFFF',
                  color: done || active ? '#fff' : '#B7A895',
                  border: !done && !active ? '2px solid rgba(30,18,6,0.12)' : 'none',
                  boxShadow: active ? '0 6px 16px rgba(225,6,0,0.4)' : 'none',
                }}
              >
                {done ? '✓' : i + 1}
              </motion.div>
              <span
                className="text-[10px] font-extrabold"
                style={{ color: active ? '#E10600' : done ? '#E10600' : '#B7A895' }}
              >
                {s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="relative mx-1.5 mb-4 h-1 w-[50px] overflow-hidden rounded-full bg-brand-cream2">
                <motion.div
                  className="h-full bg-brand-red"
                  initial={false}
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
