import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import VariantSheet from './VariantSheet';
import MenuCard from './MenuCard';
import { stagger } from './motion';
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

  // parallax 3D hero
  const heroRef = useRef<HTMLDivElement>(null);
  const hx = useMotionValue(0);
  const hy = useMotionValue(0);
  const hSpring = { stiffness: 150, damping: 18 };
  const heroRotX = useSpring(useTransform(hy, [-0.5, 0.5], [8, -8]), hSpring);
  const heroRotY = useSpring(useTransform(hx, [-0.5, 0.5], [-10, 10]), hSpring);
  const chickenX = useSpring(useTransform(hx, [-0.5, 0.5], [-16, 16]), hSpring);
  const chickenY = useSpring(useTransform(hy, [-0.5, 0.5], [-10, 10]), hSpring);
  const onHeroMove = (e: React.PointerEvent) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    hx.set((e.clientX - r.left) / r.width - 0.5);
    hy.set((e.clientY - r.top) / r.height - 0.5);
  };
  const heroReset = () => {
    hx.set(0);
    hy.set(0);
  };

  const add = (i: MenuItem) =>
    setCart((prev) => ({ ...prev, [i.id]: { ...i, qty: (prev[i.id]?.qty || 0) + 1 } }));
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
      <div className="flex items-center justify-between border-b border-brand-line bg-white/70 px-5 py-3 backdrop-blur">
        <div className="text-[13px] font-bold text-brand-ink2">
          👤 <span className="font-black text-brand-red">{user.name}</span>
          <span className="mx-1.5 text-brand-muted">·</span>
          <span className="text-brand-muted">{user.phone}</span>
        </div>
        <button
          onClick={onToggleLang}
          className="rounded-full border-2 border-brand-red/25 bg-brand-red/5 px-3 py-1 text-xs font-black text-brand-red"
        >
          {isAr ? 'EN' : 'عربي'}
        </button>
      </div>

      {/* hero card — parallax 3D */}
      <div className="px-4 pt-5" style={{ perspective: 900 }}>
        <motion.div
          ref={heroRef}
          onPointerMove={onHeroMove}
          onPointerLeave={heroReset}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            rotateX: heroRotX,
            rotateY: heroRotY,
            transformStyle: 'preserve-3d',
            background: 'linear-gradient(135deg,#E10600 0%,#FF5A1F 55%,#F5A623 130%)',
          }}
          className="relative overflow-hidden rounded-3xl px-6 py-7 text-center shadow-red"
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full"
            style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.28),transparent 65%)' }}
          />
          <motion.div className="mb-1 text-[44px]" style={{ x: chickenX, y: chickenY, transform: 'translateZ(40px)' }}>
            🍗
          </motion.div>
          <h2 className="text-2xl font-black text-white drop-shadow" style={{ transform: 'translateZ(24px)' }}>
            {isAr ? 'اختر طلبك' : 'Choose Your Order'}
          </h2>
          <p className="mt-1 text-[13px] font-bold text-white/90" style={{ transform: 'translateZ(14px)' }}>
            {isAr ? 'مكة المكرمة - الكعكية · 0500959394' : "Makkah Al-Ka'kiyah · 0500959394"}
          </p>
        </motion.div>
      </div>

      {restaurantClosed && (
        <div className="mx-4 mt-3 rounded-2xl bg-brand-red/10 py-2.5 text-center text-[13px] font-black text-brand-red">
          ⛔ {isAr ? 'المطعم مغلق حالياً' : 'Restaurant is currently closed'}
        </div>
      )}

      {/* category tabs */}
      <div className="sticky top-[62px] z-20 mt-4 overflow-x-auto bg-brand-cream/85 backdrop-blur">
        <div className="flex min-w-max gap-2 px-4 py-3">
          {cats.map((c) => {
            const on = active === c;
            return (
              <button
                key={c}
                onClick={() => setActive(c)}
                className="relative whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-black transition"
                style={{
                  color: on ? '#fff' : '#8C7A64',
                  background: on ? '#E10600' : '#FFFFFF',
                  boxShadow: on ? '0 8px 20px rgba(225,6,0,0.30)' : '0 2px 8px rgba(180,60,0,0.06)',
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* grid */}
      <main className="mx-auto max-w-[960px] px-4 pt-4" style={{ paddingBottom: count > 0 ? 120 : 30 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            variants={stagger}
            initial="initial"
            animate="animate"
            className="grid gap-3.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', perspective: 1000 }}
          >
            {menu[active].map((it) => (
              <MenuCard
                key={it.id}
                item={it}
                isAr={isAr}
                qty={cart[it.id]?.qty}
                onAdd={add}
                onRemove={remove}
                onAddClick={onAddClick}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {variantItem && (
          <VariantSheet
            item={variantItem}
            isAr={isAr}
            onClose={() => setVariantItem(null)}
            onAdd={add}
          />
        )}
      </AnimatePresence>

      {/* floating cart bar */}
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ y: 130 }}
            animate={{ y: 0 }}
            exit={{ y: 130 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[100] px-4 pb-4"
          >
            <div className="mx-auto flex max-w-[600px] items-center justify-between rounded-3xl bg-white px-5 py-3.5 shadow-[0_-6px_30px_rgba(180,60,0,0.16),0_10px_30px_rgba(180,60,0,0.16)] ring-1 ring-brand-line">
              <div>
                <div className="text-xl font-black text-brand-red">{money(total)}</div>
                <div className="text-xs font-bold text-brand-muted">
                  {count} {isAr ? 'عنصر' : 'item(s)'}
                </div>
              </div>
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={onCheckout}
                className="sheen rounded-2xl bg-brand-red px-6 py-3.5 text-[15px] font-black text-white shadow-red"
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
