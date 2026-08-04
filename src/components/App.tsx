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

  useEffect(() => {
    try {
      const s = localStorage.getItem('ba_user');
      if (s) {
        setUser(JSON.parse(s));
        setStep(1);
      }
    } catch {}
  }, []);

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
      {/* light header */}
      <header className="glass sticky top-0 z-[100] border-b border-brand-line">
        <div className="mx-auto flex h-[64px] max-w-[960px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 animate-floaty items-center justify-center rounded-2xl text-[22px] shadow-red"
              style={{ background: 'linear-gradient(135deg,#E10600,#FF5A1F)' }}
            >
              🍗
            </div>
            <div className="leading-none">
              <div className="font-display text-[15px] font-extrabold tracking-tight text-brand-ink">BROAST ALBAHR</div>
              <div className="mt-1 font-arabic text-[13px] font-extrabold text-brand-red">بروست البحر</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdminLogin(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg shadow-soft"
            >
              ⚙️
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="relative flex h-10 w-10 flex-col items-center justify-center gap-[3px] rounded-2xl bg-white shadow-soft"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="block h-[2.5px] w-5 rounded bg-brand-ink" />
              ))}
              {orders.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-[10px] font-black text-white shadow-red">
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
            <CheckoutStep cart={cart} user={user} isAr={isAr} onBack={() => setStep(1)} onOrderPlaced={onOrderPlaced} />
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
