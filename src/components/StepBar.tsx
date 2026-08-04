import { motion } from 'framer-motion';

export default function StepBar({ step, isAr }: { step: number; isAr: boolean }) {
  const steps = isAr ? ['التحقق', 'القائمة', 'الدفع'] : ['Verify', 'Menu', 'Checkout'];
  return (
    <div className="flex items-center justify-center gap-0 border-b border-white/5 bg-black/30 px-5 py-3.5 backdrop-blur">
      {steps.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <motion.div
                animate={
                  active
                    ? { scale: [1, 1.12, 1], boxShadow: '0 0 20px rgba(255,212,0,0.5)' }
                    : { scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)' }
                }
                transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-extrabold"
                style={{
                  background: done ? '#E10600' : active ? '#FFD400' : '#1a0000',
                  color: active ? '#000' : done ? '#fff' : '#555',
                  border: !done && !active ? '1px solid #333' : 'none',
                }}
              >
                {done ? '✓' : i + 1}
              </motion.div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: active ? '#FFD400' : done ? '#E10600' : '#555' }}
              >
                {s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="relative mx-1.5 mb-4 h-0.5 w-[50px] overflow-hidden rounded bg-[#2a0000]">
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
