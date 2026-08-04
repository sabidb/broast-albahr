import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MenuCard from './MenuCard';
import ItemDetail from './ItemDetail';
import ItemImage from './ItemImage';
import FoodIcon from './FoodIcon';
import { stagger, item as itemVar } from './motion';
import { detectKind } from '../lib/items';
import { money } from '../lib/utils';
import type { Menu, MenuItem } from '../lib/data';

export type Cart = Record<string, MenuItem>;

interface Props {
  menu: Menu;
  cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  user: { name: string; phone: string };
  isAr: boolean;
  restaurantClosed: boolean;
}

const stripEmoji = (s: string) => s.replace(/^[^A-Za-z؀-ۿ]+/, '').trim();

export default function MenuStep({ menu, cart, setCart, user, isAr, restaurantClosed }: Props) {
  const cats = Object.keys(menu);
  const [active, setActive] = useState(cats[0]);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<{ item: MenuItem; cat: string } | null>(null);

  const addQty = (it: MenuItem, n: number) =>
    setCart((prev) => {
      const cur = prev[it.id]?.qty || 0;
      const next = cur + n;
      if (next <= 0) {
        const u = { ...prev };
        delete u[it.id];
        return u;
      }
      return { ...prev, [it.id]: { ...it, qty: next } };
    });

  const featured = useMemo(() => Object.values(menu).flat().filter((i) => i.available).slice(0, 8), [menu]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (q) return Object.values(menu).flat().filter((i) => (i.name + i.nameAr).toLowerCase().includes(q));
    return menu[active] || [];
  }, [menu, active, q]);
  const catOf = (it: MenuItem) => Object.keys(menu).find((c) => menu[c].some((x) => x.id === it.id)) || active;

  return (
    <div className="mx-auto max-w-[640px] px-4 pb-32">
      {/* greeting */}
      <div className="pt-5">
        <div className="text-[13px] font-bold text-brand-muted">
          {isAr ? 'أهلاً' : 'Hello'}, {user.name.split(' ')[0]} 👋
        </div>
        <h1 className="text-[26px] font-black leading-tight text-brand-ink">
          {isAr ? 'وش تشتهي اليوم؟' : "What are you\ncraving today?"}
        </h1>
      </div>

      {/* search */}
      <div className="mt-4 flex items-center gap-2 rounded-[22px] bg-white px-3 py-2.5 shadow-soft ring-1 ring-brand-line focus-within:ring-2 focus-within:ring-brand-red">
        <span className="text-lg">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isAr ? 'ابحث عن بروست، برجر...' : 'Search broast, burgers…'}
          className="flex-1 bg-transparent text-[14px] font-bold text-brand-ink outline-none placeholder:font-semibold placeholder:text-brand-muted/70"
        />
        {query && <button onClick={() => setQuery('')} className="text-brand-muted">✕</button>}
      </div>

      {restaurantClosed && (
        <div className="mt-3 rounded-2xl bg-brand-red/10 py-2.5 text-center text-[13px] font-black text-brand-red">
          ⛔ {isAr ? 'المطعم مغلق حالياً' : 'Restaurant is currently closed'}
        </div>
      )}

      {/* featured — scroll-snap carousel */}
      {!q && (
        <div className="mt-6">
          <div className="mb-3 text-[16px] font-black text-brand-ink">{isAr ? '🔥 الأكثر طلباً' : '🔥 Most Popular'}</div>
          <div
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ perspective: 1000 }}
          >
            {featured.map((it) => (
              <div key={it.id} className="w-[168px] shrink-0 snap-start">
                <MenuCard item={it} category={catOf(it)} isAr={isAr} qty={cart[it.id]?.qty} onOpen={(i) => setDetail({ item: i, cat: catOf(i) })} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* category chips with icons */}
      {!q && (
        <div className="sticky top-[62px] z-20 -mx-4 mt-4 overflow-x-auto bg-brand-cream/90 px-4 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2">
            {cats.map((c) => {
              const on = active === c;
              const kind = detectKind({ name: c, nameAr: c }, c);
              return (
                <button
                  key={c}
                  onClick={() => setActive(c)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-2xl py-1.5 pe-3.5 ps-1.5 text-[13px] font-black transition"
                  style={{
                    color: on ? '#fff' : '#8C7A64',
                    background: on ? '#1E1206' : '#FFFFFF',
                    boxShadow: on ? '0 8px 18px rgba(30,18,6,0.25)' : '0 2px 8px rgba(180,60,0,0.06)',
                  }}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: on ? 'rgba(255,255,255,0.15)' : '#FFF1E0' }}>
                    <FoodIcon kind={kind} size={20} />
                  </span>
                  {stripEmoji(c)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* list rows */}
      <div className="mb-2 mt-4 text-[16px] font-black text-brand-ink">{q ? (isAr ? 'النتائج' : 'Results') : stripEmoji(active)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={q || active} variants={stagger} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.02 }} className="flex flex-col gap-2.5">
          {rows.length === 0 && <div className="py-10 text-center font-bold text-brand-muted">{isAr ? 'لا نتائج' : 'No results'}</div>}
          {rows.map((it) => {
            const qty = cart[it.id]?.qty;
            return (
              <div key={it.id} className="relative overflow-hidden rounded-[24px]">
                {/* swipe hint background (in-cart only) */}
                {qty ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-[24px] bg-brand-green/15 px-6 text-[12px] font-black text-brand-green">
                    <span>+1</span>
                    <span>−1</span>
                  </div>
                ) : null}
                <motion.div
                  variants={itemVar}
                  drag={qty ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.35}
                  dragSnapToOrigin
                  onDragEnd={(_, info) => {
                    if (info.offset.x > 70) addQty(it, 1);
                    else if (info.offset.x < -70) addQty(it, -1);
                  }}
                  whileTap={it.available ? { scale: 0.99 } : undefined}
                  onClick={() => it.available && setDetail({ item: it, cat: catOf(it) })}
                  className="relative flex cursor-pointer items-center gap-3 rounded-[24px] bg-white p-3 shadow-soft ring-1 ring-brand-line"
                  style={{ opacity: it.available ? 1 : 0.5 }}
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[20px]">
                    <ItemImage item={it} category={catOf(it)} iconSize={44} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-black text-brand-ink">{isAr ? it.nameAr : it.name}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-black text-brand-goldDeep">{it.cal}</span>
                      {!it.available && <span className="text-[11px] font-black text-brand-red">{isAr ? 'غير متاح' : 'Sold out'}</span>}
                    </div>
                    <div className="mt-1 text-[17px] font-black text-brand-red">{money(it.price)}</div>
                  </div>
                  {it.available &&
                    (qty ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <motion.button whileTap={{ scale: 0.85 }} onClick={() => addQty(it, -1)} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-cream2 text-xl font-black text-brand-ink">
                          −
                        </motion.button>
                        <motion.span key={qty} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="w-4 text-center font-black text-brand-ink">
                          {qty}
                        </motion.span>
                        <motion.button whileTap={{ scale: 0.85 }} onClick={() => addQty(it, 1)} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-red text-xl font-black text-white shadow-red">
                          +
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button whileTap={{ scale: 0.88 }} onClick={(e) => { e.stopPropagation(); setDetail({ item: it, cat: catOf(it) }); }} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-red text-2xl font-black text-white shadow-red">
                        +
                      </motion.button>
                    ))}
                </motion.div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {detail && (
          <ItemDetail
            item={detail.item}
            category={detail.cat}
            isAr={isAr}
            onClose={() => setDetail(null)}
            onAdd={(built, n) => addQty(built, n)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
