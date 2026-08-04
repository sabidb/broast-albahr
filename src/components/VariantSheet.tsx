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
      className="fixed inset-0 z-[999] flex items-end justify-center bg-black/85"
    >
      <motion.div
        variants={sheet}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-[24px] border border-[#3a0000] bg-[#110000] px-5 pb-9 pt-6"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded bg-[#3a0000]" />
        <div className="mb-2 text-center text-[32px]">{item.emoji}</div>
        <div className="mb-1 text-center text-base font-extrabold text-white">{baseName}</div>
        <div className="mb-5 text-center text-[11px] text-brand-muted">{item.cal}</div>
        <div className="mb-5 flex flex-col gap-2.5">
          {variants.map((v, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelected(i)}
              className="flex items-center justify-between rounded-xl px-4 py-3.5 transition"
              style={{
                border: selected === i ? '2px solid #FFD400' : '1px solid #2a0000',
                background: selected === i ? 'rgba(255,221,0,0.08)' : '#0d0000',
              }}
            >
              <span
                className="text-sm font-bold"
                style={{ color: selected === i ? '#FFD400' : '#ccc' }}
              >
                {v.label}
              </span>
              <span className="text-[15px] font-extrabold text-brand-gold">{money(v.price)}</span>
            </motion.button>
          ))}
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={confirm}
          disabled={selected === null}
          className="sheen w-full rounded-xl py-4 text-base font-extrabold disabled:cursor-not-allowed"
          style={{
            background: selected !== null ? 'linear-gradient(135deg,#E10600,#8a0000)' : '#1a0000',
            border: selected !== null ? '2px solid #FFD400' : '1px solid #2a0000',
            color: selected !== null ? '#FFD400' : '#444',
          }}
        >
          {isAr ? 'أضف للسلة' : 'Add to Cart'}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
