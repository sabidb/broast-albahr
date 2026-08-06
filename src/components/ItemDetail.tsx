import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ItemImage from './ItemImage';
import { detectKind, piecesOf, accompaniment, kindGradient } from '../lib/items';
import { money } from '../lib/utils';
import type { MenuItem } from '../lib/data';

interface Variant {
  label: string;
  labelEn: string;
  price: number;
  suffix: string;
  suffixAr: string;
}

export default function ItemDetail({
  item,
  category,
  isAr,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  category: string;
  isAr: boolean;
  onClose: () => void;
  onAdd: (built: MenuItem, qty: number) => void;
}) {
  const kind = detectKind(item, category);
  const pieces = piecesOf(item);
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

  const [selected, setSelected] = useState<number | null>(variants.length ? 0 : null);
  const [qty, setQty] = useState(1);

  // Hide the App-level "View Cart" FAB while this sheet is open so it
  // never overlaps the Add-to-Cart bar.
  useEffect(() => {
    document.body.classList.add('no-cart-fab');
    return () => {
      document.body.classList.remove('no-cart-fab');
    };
  }, []);

  const baseName = (isAr ? item.nameAr : item.name)
    .replace(/\s*\/\s*(Normal|Spicy|عادي|حراق|With Cheese|مع جن|Green Pepper|فلفل أخضر)/gi, '')
    .replace(/\s*(Normal|Spicy)\/?(Normal|Spicy)?/gi, '')
    .replace(/\s*(عادي|حراق)\/?(عادي|حراق)?/gi, '')
    .replace(/\s*With Cheese/gi, '')
    .replace(/\s*مع جن/gi, '')
    .trim();

  const unit = selected !== null && variants[selected] ? variants[selected].price : item.price;
  const total = unit * qty;

  const confirm = () => {
    let built: MenuItem = item;
    if (variants.length && selected !== null) {
      const v = variants[selected];
      built = {
        ...item,
        id: item.id + '_' + v.suffix.replace(/ /g, '_'),
        name: item.name.replace(/\s*\/.*$/, '').trim() + ' ' + v.labelEn,
        nameAr: item.nameAr.replace(/\s*\/.*$/, '').trim() + ' ' + v.suffixAr,
        price: v.price,
      };
    }
    onAdd(built, qty);
    onClose();
  };

  const chip = 'rounded-full bg-white/85 px-3 py-1 text-[12px] font-black text-brand-ink';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[300] flex items-end justify-center bg-brand-ink/50 backdrop-blur-sm"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 130 || info.velocity.y > 700) onClose();
        }}
        className="flex h-[92dvh] max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[30px] bg-brand-cream sm:h-auto sm:max-h-[88vh]"
      >
        {/* compact image hero */}
        <div className="relative shrink-0 px-5 pb-4 pt-3" style={{ background: kindGradient(kind) }}>
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/50" />
          <button
            onClick={onClose}
            className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-2xl bg-white/25 text-lg text-white"
          >
            ✕
          </button>
          <motion.div
            initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className="mx-auto h-32 w-32 overflow-hidden rounded-[28px] bg-white/20 ring-8 ring-white/10 sm:h-40 sm:w-40"
          >
            <ItemImage item={item} category={category} iconSize={100} />
          </motion.div>
          <h2 className="mt-3 text-center text-[22px] font-black leading-tight text-white drop-shadow sm:text-2xl">{baseName}</h2>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <span className={chip}>🔥 {item.cal}</span>
            {pieces && <span className={chip}>{isAr ? `${pieces} قطع` : `${pieces} pieces`}</span>}
            <span className={chip}>{isAr ? '١٠٠٪ حلال' : '100% Halal'}</span>
          </div>
        </div>

        {/* details (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="text-[13px] font-black uppercase tracking-wide text-brand-muted">
            {isAr ? 'يأتي معه' : 'What you get'}
          </div>
          <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-brand-ink2">
            {accompaniment(kind, isAr)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-3 text-center shadow-soft ring-1 ring-brand-line">
              <div className="text-[11px] font-bold text-brand-muted">{isAr ? 'السعرات' : 'Calories'}</div>
              <div className="text-[16px] font-black text-brand-red">{item.cal}</div>
            </div>
            <div className="rounded-2xl bg-white p-3 text-center shadow-soft ring-1 ring-brand-line">
              <div className="text-[11px] font-bold text-brand-muted">{isAr ? 'القطع' : 'Pieces'}</div>
              <div className="text-[16px] font-black text-brand-red">{pieces ?? (isAr ? '—' : '1 serving')}</div>
            </div>
          </div>

          {variants.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[13px] font-black uppercase tracking-wide text-brand-muted">
                {isAr ? 'اختر النكهة' : 'Choose your flavor'}
              </div>
              <div className="flex flex-wrap gap-2">
                {variants.map((v, i) => {
                  const on = selected === i;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelected(i)}
                      className="rounded-2xl border-2 px-4 py-2.5 text-[14px] font-black transition"
                      style={{
                        borderColor: on ? '#E10600' : 'rgba(30,18,6,0.12)',
                        background: on ? '#E10600' : '#fff',
                        color: on ? '#fff' : '#1E1206',
                      }}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* always-visible add bar */}
        <div
          className="shrink-0 border-t border-brand-line bg-white/95 px-5 pt-4 backdrop-blur"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl bg-brand-cream2 px-2 py-1.5">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-xl font-black text-brand-ink"
              >
                −
              </button>
              <motion.span key={qty} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="w-5 text-center text-lg font-black text-brand-ink">
                {qty}
              </motion.span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-red text-xl font-black text-white shadow-red"
              >
                +
              </button>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={confirm}
              className="sheen flex flex-1 items-center justify-between rounded-2xl bg-brand-red px-5 py-3.5 text-white shadow-red"
            >
              <span className="text-[15px] font-black">{isAr ? 'أضف للسلة' : 'Add to Cart'}</span>
              <span className="font-display text-[16px] font-black">{money(total)}</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
