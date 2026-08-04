import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Splash from './Splash';
import StepBar from './StepBar';
import VerifyStep from './VerifyStep';
import MenuStep, { type Cart } from './MenuStep';
import CheckoutStep from './CheckoutStep';
import OrderSuccess from './OrderSuccess';
import HistoryDrawer from './HistoryDrawer';
import AdminPanel, { AdminLogin } from './AdminPanel';
import { pageVariants } from './motion';
import { DEFAULT_MENU, type Menu } from '../lib/data';
import { loyaltyPointsFor } from '../lib/utils';
import { FB } from '../lib/fb';
import type { Order } from './Invoice';

type User = { name: string; phone: string };

export default function App() {
  const [splash, setSplash] = useState(true);
  const [step, setStep] = useState(0); // 0 verify · 1 menu · 2 checkout · 3 success
  const [user, setUser] = useState<User | null>(null);
  const [menu, setMenu] = useState<Menu>(DEFAULT_MENU);
  const [cart, setCart] = useState<Cart>({});
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [view, setView] = useState<'app' | 'admin'>('app');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [restaurantClosed, setRestaurantClosed] = useState(false);
  const orderCounter = useRef(1000);
  const isAr = lang === 'ar';

  // hydrate saved user
  useEffect(() => {
    try {
      const s = localStorage.getItem('ba_user');
      if (s) {
        setUser(JSON.parse(s));
        setStep(1);
      }
    } catch {}
  }, []);

  // Firebase live menu + settings
  useEffect(() => {
    let unsubMenu = () => {};
    let unsubSettings = () => {};
    (async () => {
      const m = await FB.getMenu();
      if (m) setMenu(m);
      const s = await FB.getSettings();
      if (s && s.isOpen === false) setRestaurantClosed(true);
      unsubMenu = FB.onMenuChange((mm) => mm && setMenu(mm));
      unsubSettings = FB.onSettingsChange((ss) => setRestaurantClosed(ss.isOpen === false));
    })();
    return () => {
      unsubMenu();
      unsubSettings();
    };
  }, []);

  const saveMenu = (m: Menu) => {
    setMenu(m);
    FB.saveMenu(m);
  };

  const onVerified = (u: User) => {
    setUser(u);
    setStep(1);
    try {
      localStorage.setItem('ba_user', JSON.stringify(u));
    } catch {}
  };

  const onOrderPlaced = (payload: any) => {
    const order: Order = {
      ...payload,
      orderNo: String(orderCounter.current++).padStart(4, '0'),
      date: new Date().toISOString(),
    };
    setOrders((prev) => [order, ...prev]);
    setLastOrder(order);
    FB.saveOrder({
      ...payload,
      userName: payload.user.name,
      userPhone: payload.user.phone,
      total: order.totals.total,
      orderNo: order.orderNo,
      date: order.date,
    });
    if (user?.phone) {
      FB.saveCustomer({
        name: user.name,
        phone: user.phone,
        loyaltyPoints: loyaltyPointsFor(order.totals.total),
      });
    }
    setStep(3);
  };

  if (splash) {
    return (
      <div className="ambient min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
        <AnimatePresence>{splash && <Splash onDone={() => setSplash(false)} />}</AnimatePresence>
      </div>
    );
  }

  if (view === 'admin') {
    return <AdminPanel menu={menu} onSave={saveMenu} onExit={() => setView('app')} />;
  }

  return (
    <div className="ambient min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
      {/* header */}
      <header className="app-header sticky top-0 z-[100] border-b-[3px] border-brand-gold" style={{ background: 'linear-gradient(100deg,#c20500,#8a0000 55%,#5e0000)', boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
        <div className="mx-auto flex h-[62px] max-w-[960px] items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-[46px] w-[46px] animate-floaty items-center justify-center rounded-full border-[3px] border-brand-gold text-[22px]"
              style={{ background: 'radial-gradient(circle at 35% 30%,#d61111,#7a0000)', boxShadow: '0 6px 18px rgba(214,0,0,.5),0 0 0 4px rgba(255,212,0,.12)' }}
            >
              🍗
            </div>
            <div>
              <div className="text-[17px] font-extrabold tracking-wide text-brand-gold">BROAST ALBAHR</div>
              <div className="font-arabic text-xs font-bold text-white">بروست البحر</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowAdminLogin(true)}
              className="rounded-full border border-brand-gold/30 bg-black/25 px-3 py-1.5 text-sm text-brand-gold/70"
            >
              ⚙️
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="relative flex flex-col gap-1 rounded-[10px] border border-brand-gold/30 bg-black/25 px-2.5 py-2"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="block h-0.5 w-5 rounded bg-brand-gold" />
              ))}
              {orders.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-gold text-[10px] font-black text-black">
                  {orders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {step < 3 && <StepBar step={step} isAr={isAr} />}

      <AnimatePresence mode="wait">
        <motion.div key={step} variants={pageVariants} initial="initial" animate="animate" exit="exit">
          {step === 0 && <VerifyStep isAr={isAr} onVerified={onVerified} />}
          {step === 1 && user && (
            <MenuStep
              menu={menu}
              cart={cart}
              setCart={setCart}
              user={user}
              isAr={isAr}
              onToggleLang={() => setLang(isAr ? 'en' : 'ar')}
              onCheckout={() => setStep(2)}
              restaurantClosed={restaurantClosed}
            />
          )}
          {step === 2 && user && (
            <CheckoutStep
              cart={cart}
              user={user}
              isAr={isAr}
              onBack={() => setStep(1)}
              onOrderPlaced={onOrderPlaced}
            />
          )}
          {step === 3 && lastOrder && (
            <OrderSuccess
              order={lastOrder}
              isAr={isAr}
              onNewOrder={() => {
                setCart({});
                setStep(1);
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showAdminLogin && (
          <AdminLogin
            onLogin={() => {
              setShowAdminLogin(false);
              setView('admin');
            }}
            onCancel={() => setShowAdminLogin(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && <HistoryDrawer orders={orders} isAr={isAr} onClose={() => setShowHistory(false)} />}
      </AnimatePresence>
    </div>
  );
}
