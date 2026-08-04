import { useState } from 'react';
import { motion } from 'framer-motion';
import { sheet } from './motion';
import { money } from '../lib/utils';
import type { MenuItem } from '../lib/data';

interface Variant {
  label: string;
  labelEn: string;
  price: number;
  suffix: string;
  suffixAr: string;
}

export default function VariantSheet({
  item,
  isAr,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  isAr: boolean;
  onClose: () => void;
  onAdd: (i: MenuItem) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const blob = item.nameAr + item.name;
  const isSpicy = /Normal.*Spicy|Spicy.*Normal|عادي.*حراق|حراق.*عادي/i.test(blob);
  const isCheese = /With Cheese|مع جن/i.test(blob);
  const isGarlic = /Green Pepper|فلفل/i.test(blob);

  const variants: Variant[] = [];
  if (isGarlic) {
    variants.push(
      { label: isAr ? 'عادي' : 'Normal', labelEn: 'Normal', price: item.price, suffix: 'Normal', suffixAr: 'عادي' },
      { label: isAr ? 'حراق' : 'Spicy', labelEn: 'Spicy', price: item.price, suffix: 'Spicy', suffixAr: 'حراق' },
      { label: isAr ? 'فلفل أخضر' : 'Green Pepper', labelEn: 'Green Pepper', price: item.price, suffix: 'Green Pepper', suffixAr: 'فلفل أخضر' },
    );
  } else if (isSpicy) {
    variants.push(
      { label: isAr ? 'عادي' : 'Normal', labelEn: 'Normal', price: item.price, suffix: 'Normal', suffixAr: 'عادي' },
      { label: isAr ? 'حراق' : 'Spicy', labelEn: 'Spicy', price: item.price, suffix: 'Spicy', suffixAr: 'حراق' },
    );
  } else if (isCheese) {
    variants.push(
      { label: isAr ? 'بدون جبن' : 'Without Cheese', labelEn: 'Without Cheese', price: item.price - 1, suffix: 'Without Cheese', suffixAr: 'بدون جبن' },
      { label: isAr ? 'مع جبن' : 'With Cheese', labelEn: 'With Cheese', price: item.price, suffix: 'With Cheese', suffixAr: 'مع جبن' },
    );
  }

  const baseName = (isAr ? item.nameAr : item.name)
    .replace(/\s*\/\s*(Normal|Spicy|عادي|حراق|With Cheese|مع جن|Green Pepper|فلفل أخضر)/gi, '')
    .replace(/\s*(Normal|Spicy)\/?(Normal|Spicy)?/gi, '')
    .replace(/\s*(عادي|حراق)\/?(عادي|حراق)?/gi, '')
    .replace(/\s*With Cheese/gi, '')
    .replace(/\s*مع جن/gi, '')
    .trim();

  const confirm = () => {
    if (selected === null) return;
    const v = variants[selected];
    onAdd({
      ...item,
      id: item.id + '_' + v.suffix.replace(/ /g, '_'),
      name: item.name.replace(/\s*\/.*$/, '').trim() + ' ' + v.labelEn,
      nameAr: item.nameAr.replace(/\s*\/.*$/, '').trim() + ' ' + v.suffixAr,
      price: v.price,
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[999] flex items-end justify-center bg-brand-ink/40 backdrop-blur-sm"
    >
      <motion.div
        variants={sheet}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-[28px] bg-white px-5 pb-9 pt-5 shadow-[0_-20px_50px_rgba(0,0,0,0.18)]"
      >
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-brand-cream2" />
        <div className="mb-2 text-center text-[40px]">{item.emoji}</div>
        <div className="mb-1 text-center text-lg font-black text-brand-ink">{baseName}</div>
        <div className="mb-5 text-center text-[12px] font-bold text-brand-muted">{item.cal}</div>
        <div className="mb-5 flex flex-col gap-2.5">
          {variants.map((v, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelected(i)}
              className="flex items-center justify-between rounded-2xl border-2 px-4 py-3.5 transition"
              style={{
                borderColor: selected === i ? '#E10600' : 'rgba(30,18,6,0.10)',
                background: selected === i ? 'rgba(225,6,0,0.06)' : '#FFF6EA',
              }}
            >
              <span className="text-[15px] font-extrabold" style={{ color: selected === i ? '#E10600' : '#3A2A18' }}>
                {v.label}
              </span>
              <span className="text-[15px] font-black text-brand-ink">{money(v.price)}</span>
            </motion.button>
          ))}
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={confirm}
          disabled={selected === null}
          className="sheen w-full rounded-2xl bg-brand-red py-4 text-base font-black text-white shadow-red disabled:cursor-not-allowed disabled:bg-brand-cream2 disabled:text-brand-muted disabled:shadow-none"
        >
          {isAr ? 'أضف للسلة' : 'Add to Cart'}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
