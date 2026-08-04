import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import VariantSheet from './VariantSheet';
import { stagger, item as itemVar } from './motion';
import { money } from '../lib/utils';
import type { Menu, MenuItem } from '../lib/data';

export type Cart = Record<string, MenuItem>;

interface Props {
  menu: Menu;
  cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  onCheckout: () => void;
  user: { name: string; phone: string };
  isAr: boolean;
  onToggleLang: () => void;
  restaurantClosed: boolean;
}

const hasVariants = (i: MenuItem) =>
  /Normal.*Spicy|Spicy.*Normal|With Cheese|مع جن|عادي.*حراق|حراق.*عادي|Green Pepper|فلفل/i.test(
    i.nameAr + i.name,
  );

export default function MenuStep({
  menu,
  cart,
  setCart,
  onCheckout,
  user,
  isAr,
  onToggleLang,
  restaurantClosed,
}: Props) {
  const cats = Object.keys(menu);
  const [active, setActive] = useState(cats[0]);
  const [variantItem, setVariantItem] = useState<MenuItem | null>(null);

  const add = (i: MenuItem) =>
    setCart((prev) => ({
      ...prev,
      [i.id]: { ...i, qty: (prev[i.id]?.qty || 0) + 1 },
    }));
  const remove = (id: string | number) =>
    setCart((prev) => {
      const u = { ...prev };
      if ((u[id]?.qty || 0) > 1) u[id] = { ...u[id], qty: (u[id].qty || 1) - 1 };
      else delete u[id];
      return u;
    });
  const onAddClick = (i: MenuItem) => (hasVariants(i) ? setVariantItem(i) : add(i));

  const cartItems = Object.values(cart);
  const total = useMemo(() => cartItems.reduce((s, i) => s + i.price * (i.qty || 0), 0), [cart]);
  const count = useMemo(() => cartItems.reduce((s, i) => s + (i.qty || 0), 0), [cart]);

  return (
    <div>
      {/* user strip */}
      <div className="flex items-center justify-between border-b border-[#2a0000] bg-black/40 px-5 py-2.5">
        <div className="text-[13px] text-[#888]">
          👤 <span className="font-bold text-brand-gold">{user.name}</span>
          <span className="mx-1.5 text-[#444]">·</span>
          <span className="text-[#666]">{user.phone}</span>
        </div>
        <button
          onClick={onToggleLang}
          className="rounded-full border border-brand-gold/30 bg-brand-gold/10 px-3 py-1 text-xs font-bold text-brand-gold"
        >
          {isAr ? 'EN' : 'عربي'}
        </button>
      </div>

      {/* hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-[#330000] px-5 pb-4 pt-6 text-center"
        style={{ background: 'linear-gradient(135deg,#cc0000 0%,#880000 60%,#130000 100%)' }}
      >
        <div className="mb-1 animate-floaty text-[40px]">🍗</div>
        <h2 className="text-xl font-extrabold text-brand-gold">
          {isAr ? 'اختر طلبك' : 'Choose Your Order'}
        </h2>
        <p className="mt-1 text-xs text-white/60">
          {isAr ? 'مكة المكرمة - الكعكية · 0500959394' : "Makkah Al-Ka'kiyah · 0500959394"}
        </p>
      </motion.div>

      {restaurantClosed && (
        <div className="bg-brand-red/15 py-2 text-center text-[13px] font-bold text-brand-red">
          ⛔ {isAr ? 'المطعم مغلق حالياً' : 'Restaurant is currently closed'}
        </div>
      )}

      {/* category tabs */}
      <div className="sticky top-[62px] z-20 overflow-x-auto border-b border-[#2a0000] bg-black/60 backdrop-blur">
        <div className="flex min-w-max px-3">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className="relative whitespace-nowrap px-3 py-3 text-xs font-semibold transition-colors"
              style={{ color: active === c ? '#FFD400' : '#666' }}
            >
              {c}
              {active === c && (
                <motion.div
                  layoutId="cat-underline"
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-gold"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <main
        className="mx-auto max-w-[960px] px-3.5 pt-5"
        style={{ paddingBottom: count > 0 ? 110 : 30 }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            variants={stagger}
            initial="initial"
            animate="animate"
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}
          >
            {menu[active].map((it) => (
              <motion.div
                key={it.id}
                variants={itemVar}
                whileHover={it.available ? { y: -6 } : undefined}
                className="card-surface grad-ring relative flex flex-col gap-2 p-4"
                style={{ opacity: it.available ? 1 : 0.45 }}
              >
                {!it.available && (
                  <div className="absolute inset-0 z-[2] flex items-center justify-center rounded-[20px] bg-black/50">
                    <span className="rounded-full bg-brand-red px-3.5 py-1 text-xs font-extrabold text-white">
                      {isAr ? 'غير متاح' : 'Unavailable'}
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <span className="text-[30px]">{it.emoji}</span>
                  <span className="rounded-full border border-[#380000] bg-[#1e0000] px-1.5 py-0.5 text-[10px] font-bold text-brand-red">
                    {it.cal}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold leading-tight text-white">
                    {isAr ? it.nameAr : it.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#555]">{isAr ? it.name : it.nameAr}</div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[17px] font-extrabold text-brand-gold">{money(it.price)}</span>
                  {it.available &&
                    (cart[it.id] ? (
                      <div className="flex items-center gap-2">
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => remove(it.id)}
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-[#2a0000] text-[17px] font-extrabold text-[#ccc]"
                        >
                          −
                        </motion.button>
                        <motion.span
                          key={cart[it.id].qty}
                          initial={{ scale: 1.4 }}
                          animate={{ scale: 1 }}
                          className="min-w-4 text-center font-extrabold"
                        >
                          {cart[it.id].qty}
                        </motion.span>
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => add(it)}
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-brand-red text-[17px] font-extrabold text-white"
                        >
                          +
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => onAddClick(it)}
                        className="rounded-lg border border-[#3a0000] bg-[#1a0000] px-3.5 py-1.5 text-xs font-semibold text-[#aaa] transition hover:border-transparent hover:text-white"
                        style={{ backgroundImage: 'none' }}
                      >
                        {isAr ? 'أضف' : 'Add'}
                      </motion.button>
                    ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>{variantItem && (
        <VariantSheet
          item={variantItem}
          isAr={isAr}
          onClose={() => setVariantItem(null)}
          onAdd={add}
        />
      )}</AnimatePresence>

      {/* floating cart bar */}
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ y: 120 }}
            animate={{ y: 0 }}
            exit={{ y: 120 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="sheen fixed inset-x-0 bottom-0 z-[100] border-t-[3px] border-brand-gold px-5 py-3.5"
            style={{
              background: 'linear-gradient(135deg,#cc0000,#990000)',
              boxShadow: '0 -10px 34px rgba(214,0,0,.35)',
            }}
          >
            <div className="mx-auto flex max-w-[960px] items-center justify-between">
              <div>
                <div className="text-lg font-extrabold text-brand-gold">{money(total)}</div>
                <div className="text-xs text-white/70">
                  {count} {isAr ? 'عنصر' : 'item(s)'}
                </div>
              </div>
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={onCheckout}
                className="rounded-xl bg-brand-gold px-6 py-3 text-[15px] font-extrabold text-black shadow-gold"
              >
                {isAr ? 'المتابعة للدفع →' : 'Proceed to Checkout →'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
