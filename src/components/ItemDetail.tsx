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
  const [note, setNote] = useState('');

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
    const trimmedNote = note.trim();
    if (trimmedNote) built = { ...built, note: trimmedNote };
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
        className="flex h-[92dvh] max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[30px] bg-brand-cream sm:h-[88vh] sm:max-h-[88vh]"
      >
        {/* compact image hero */}
        <div className="relative shrink-0 px-5 pb-3 pt-2.5" style={{ background: kindGradient(kind) }}>
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-white/50" />
          <button
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="absolute end-4 top-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-white/25 text-lg text-white"
          >
            ✕
          </button>
          <motion.div
            initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className="mx-auto h-24 w-24 overflow-hidden rounded-[24px] bg-white/20 ring-8 ring-white/10 sm:h-28 sm:w-28"
          >
            <ItemImage item={item} category={category} iconSize={84} />
          </motion.div>
          <h2 className="mt-2 text-center text-[19px] font-black leading-tight text-white drop-shadow sm:text-[22px]">{baseName}</h2>
          <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
            <span className={chip}>🔥 {item.cal}</span>
            {pieces && <span className={chip}>{isAr ? `${pieces} قطع` : `${pieces} pieces`}</span>}
            <span className={chip}>{isAr ? '١٠٠٪ حلال' : '100% Halal'}</span>
          </div>
        </div>

        {/* details — compact, scrolls only if the phone is very small */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[13px] font-semibold leading-snug text-brand-ink2">
            {accompaniment(kind, isAr)}
          </p>

          {variants.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-brand-muted">
                {isAr ? 'اختر النكهة' : 'Choose your flavor'}
              </div>
              <div className="flex flex-wrap gap-2">
                {variants.map((v, i) => {
                  const on = selected === i;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelected(i)}
                      className="rounded-2xl border-2 px-3.5 py-2 text-[13px] font-black transition"
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

          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-brand-muted">
              {isAr ? 'ملاحظات (اختياري)' : 'Special notes (optional)'}
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isAr ? 'بدون بصل، صلصة إضافية...' : 'no onions, extra sauce...'}
              maxLength={140}
              className="w-full rounded-2xl border-2 border-brand-line bg-white px-4 py-2.5 text-[13px] font-bold text-brand-ink outline-none focus:border-brand-red"
            />
          </div>
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
