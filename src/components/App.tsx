import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import CountUp from './CountUp';
import Splash from './Splash';
import VerifyStep from './VerifyStep';
import MenuStep, { type Cart } from './MenuStep';
import CheckoutStep from './CheckoutStep';
import OrderSuccess from './OrderSuccess';
import RewardsScreen from './RewardsScreen';
import OrdersScreen from './OrdersScreen';
import OrderTrackingScreen from './OrderTrackingScreen';
import AccountScreen from './AccountScreen';
import NavDrawer from './NavDrawer';
import AdminPanel, { AdminLogin } from './AdminPanel';
import StreakModal from './StreakModal';
import BranchSelectStep from './BranchSelectStep';
import { NotificationsBell, NotificationsSheet } from './NotificationsSheet';

export type Tab = 'menu' | 'rewards' | 'orders' | 'account';
import { pageVariants } from './motion';
import { money, APP_VERSION } from '../lib/utils';
import { DEFAULT_MENU, BRANCHES, type Menu } from '../lib/data';
import { FB } from '../lib/fb';
import { tickStreak, loadStreak, type StreakState, type StreakTick } from '../lib/streak';
import {
  loadLoyalty,
  addPoints,
  pointsForOrder,
  redeem,
  type LoyaltyState,
  type Reward,
} from '../lib/loyalty';
import type { Order } from './Invoice';

type User = { name: string; phone: string };

export default function App() {
  const [splash, setSplash] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(DEFAULT_MENU);
  const [cart, setCart] = useState<Cart>({});
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [view, setView] = useState<'app' | 'admin'>('app');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [restaurantClosed, setRestaurantClosed] = useState(false);
  const [tab, setTab] = useState<Tab>('menu');
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [streak, setStreak] = useState<StreakState>(loadStreak);
  const [streakTick, setStreakTick] = useState<StreakTick | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyState>(loadLoyalty);
  const [toast, setToast] = useState<string | null>(null);
  const orderCounter = useRef(1000);
  const isAr = lang === 'ar';

  useEffect(() => {
    try {
      const s = localStorage.getItem('ba_user');
      if (s) setUser(JSON.parse(s));
      const b = localStorage.getItem('ba_branch');
      if (b) setBranchId(b);
    } catch {}
    const t = tickStreak();
    setStreak(t.state);
    if (t.changed) setStreakTick(t);
    setLoyalty(loadLoyalty());
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

  // Load persisted orders + subscribe to live updates for this user
  useEffect(() => {
    if (!user?.phone) return;
    let cancelled = false;
    (async () => {
      const rows = await FB.getCustomerOrders(user.phone);
      if (cancelled) return;
      const shaped: Order[] = rows.map((r: any) => ({
        orderNo: r.orderNo || '000000',
        date: r.date || new Date((r.createdAt?.seconds || 0) * 1000).toISOString(),
        user: { name: r.userName || user.name, phone: r.userPhone || user.phone },
        branchObj: r.branchObj || { nameEn: r.branch || '' },
        orderType: r.orderType || 'pickup',
        pickupTime: r.pickupTime || '',
        paymentMethod: r.paymentMethod || 'cash',
        couponCode: r.couponCode || '',
        items: r.items || [],
        totals: r.totals || { subtotal: 0, pFee: 0, dFee: 0, discount: 0, vat: 0, total: r.total || 0 },
        fbId: r.fbId,
        status: r.status || 'pending',
        rating: r.rating || null,
      }));
      setOrders(shaped);
    })();
    // Live subscribe to any status changes on this user's orders
    const unsub = FB.onOrdersChange((all) => {
      const mine = all.filter((o: any) => o.userPhone === user.phone);
      setOrders((prev) => {
        const map = new Map(prev.map((o) => [o.fbId || o.orderNo, o]));
        mine.forEach((o: any) => {
          const k = o.fbId || o.orderNo;
          const existing = map.get(k);
          if (existing) {
            map.set(k, {
              ...existing,
              status: o.status || existing.status,
              rating: o.rating || existing.rating,
            });
          }
        });
        return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.phone, user?.name]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const onVerified = (u: User) => {
    setUser(u);
    try {
      localStorage.setItem('ba_user', JSON.stringify(u));
    } catch {}
  };

  const onOrderPlaced = async (payload: any) => {
    // Reserve atomic 6-digit order-no first so the popup + Firestore match.
    const orderNo = await FB.nextOrderNo();
    const order: Order = {
      ...payload,
      orderNo,
      date: new Date().toISOString(),
      status: 'pending',
    };
    setOrders((prev) => [order, ...prev]);
    setLastOrder(order);
    setCheckoutOpen(false);
    const saved = await FB.saveOrder({
      ...payload,
      userName: payload.user.name,
      userPhone: payload.user.phone,
      total: order.totals.total,
      orderNo,
      date: order.date,
    });
    if (saved.fbId) {
      // patch the local copies with the Firestore id so we can subscribe/track live.
      setOrders((prev) => prev.map((o) => (o.orderNo === orderNo ? { ...o, fbId: saved.fbId } : o)));
      setLastOrder((cur) => (cur && cur.orderNo === orderNo ? { ...cur, fbId: saved.fbId } : cur));
    }
    // earn loyalty points
    const earned = pointsForOrder(order.totals.total, loyalty.lifetime);
    setLoyalty(addPoints(earned, `Order #${orderNo}`));
    if (user?.phone)
      FB.saveCustomer({
        name: user.name,
        phone: user.phone,
        loyaltyPoints: earned,
        lastAddress: payload.address || '',
        locationLink: payload.locationLink || '',
      });
    showToast(isAr ? `+${earned} نقطة 🎁` : `+${earned} points 🎁`);
  };

  const [trackOrder, setTrackOrder] = useState<Order | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const onRateOrder = (fbId: string, stars: number, comment: string) => {
    FB.saveOrderRating(fbId, stars, comment);
    setOrders((prev) => prev.map((o) => (o.fbId === fbId ? { ...o, rating: { stars, comment } } : o)));
  };

  const onRedeem = (r: Reward) => {
    const res = redeem(r.id);
    if (res.ok) {
      setLoyalty(res.state);
      showToast(
        isAr
          ? `تم! استخدم الرمز ${r.code} ${r.counter ? '(عند الفرع)' : 'عند الدفع'}`
          : `Unlocked! Use ${r.code} ${r.counter ? '(at counter)' : 'at checkout'}`,
      );
    }
  };

  const cartCount = Object.values(cart).reduce((s, i) => s + (i.qty || 0), 0);
  const cartTotal = Object.values(cart).reduce((s, i) => s + i.price * (i.qty || 0), 0);
  const currentBranch = BRANCHES.find((b) => b.id === branchId);
  const branchLabel = currentBranch ? (isAr ? currentBranch.nameAr : currentBranch.nameEn) : null;

  // scroll-reactive header + progress bar
  const { scrollY, scrollYProgress } = useScroll();
  const headerShadow = useTransform(scrollY, [0, 60], ['0 0 0 rgba(0,0,0,0)', '0 12px 30px rgba(180,60,0,0.14)']);
  const headerBlur = useTransform(scrollY, [0, 60], ['saturate(1) blur(6px)', 'saturate(1.2) blur(16px)']);

  if (splash) {
    return (
      <div className="ambient min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
        <AnimatePresence>{splash && <Splash onDone={() => setSplash(false)} />}</AnimatePresence>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="ambient min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
        <VerifyStep isAr={isAr} onVerified={onVerified} />
      </div>
    );
  }

  if (!branchId) {
    return <BranchSelectStep isAr={isAr} onSelect={(id) => setBranchId(id)} />;
  }

  if (view === 'admin') {
    return (
      <AdminPanel
        menu={menu}
        isOpen={!restaurantClosed}
        onToggleOpen={(open) => {
          setRestaurantClosed(!open);
          FB.saveSettings({ isOpen: open });
        }}
        onSave={(m) => {
          setMenu(m);
          FB.saveMenu(m);
        }}
        onExit={() => setView('app')}
      />
    );
  }

  return (
    <div className="ambient min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
      {/* scroll progress bar */}
      <motion.div
        className="fixed inset-x-0 top-0 z-[85] h-1"
        style={{
          scaleX: scrollYProgress,
          transformOrigin: isAr ? 'right' : 'left',
          background: 'linear-gradient(90deg,#E10600,#FF5A1F,#F5A623)',
        }}
      />

      {/* slim header — elevates on scroll */}
      <motion.header
        className="sticky top-0 z-[80] border-b border-brand-line"
        style={{ boxShadow: headerShadow, backdropFilter: headerBlur, background: 'rgba(255,246,234,0.82)' }}
      >
        <div className="mx-auto flex h-[62px] max-w-[640px] items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            {/* hamburger */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setMenuOpen(true)}
              aria-label="menu"
              className="flex h-10 w-10 flex-col items-center justify-center gap-[4px] rounded-2xl bg-white shadow-soft"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="block h-[2.5px] w-5 rounded bg-brand-ink" />
              ))}
            </motion.button>
            <button onClick={() => setTab('menu')} className="text-start leading-none">
              <div className="font-display text-[14px] font-extrabold tracking-tight text-brand-ink">BROAST AL BAHR</div>
              <div className="mt-0.5 font-arabic text-[12px] font-bold text-brand-red">بروست البحر</div>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell phone={user.phone} isAr={isAr} onOpen={() => setNotifOpen(true)} />
            {/* My Orders — kept out of the hamburger */}
            <button
              onClick={() => setTab('orders')}
              aria-label="orders"
              className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg shadow-soft"
            >
              🧾
              {orders.length > 0 && (
                <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-black text-white">
                  {orders.length}
                </span>
              )}
            </button>
            {/* points + streak */}
            <button
              onClick={() => setTab('rewards')}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-white shadow-red"
              style={{ background: 'linear-gradient(135deg,#E10600,#FF5A1F)' }}
            >
              <span className="text-sm">🎁</span>
              <CountUp value={loyalty.points} className="font-display text-[13px] font-black" />
              <span className="mx-0.5 opacity-50">·</span>
              <span className="text-[13px] font-black">🔥{streak.count}</span>
            </button>
          </div>
        </div>
      </motion.header>

      {/* tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} variants={pageVariants} initial="initial" animate="animate" exit="exit">
          {tab === 'menu' && (
            <MenuStep menu={menu} cart={cart} setCart={setCart} user={user} isAr={isAr} restaurantClosed={restaurantClosed} />
          )}
          {tab === 'rewards' && <RewardsScreen loyalty={loyalty} streak={streak} isAr={isAr} onRedeem={onRedeem} />}
          {tab === 'orders' && (
            <OrdersScreen orders={orders} isAr={isAr} onReorder={() => setTab('menu')} onTrack={(o) => setTrackOrder(o)} />
          )}
          {tab === 'account' && (
            <AccountScreen
              user={user}
              loyalty={loyalty}
              streak={streak}
              isAr={isAr}
              onToggleLang={() => setLang(isAr ? 'en' : 'ar')}
              onAdmin={() => setShowAdminLogin(true)}
              onLogout={() => {
                try {
                  localStorage.removeItem('ba_user');
                } catch {}
                setUser(null);
                setCart({});
                setTab('menu');
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* cart FAB */}
      <AnimatePresence>
        {cartCount > 0 && tab === 'menu' && !checkoutOpen && (
          <motion.button
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setCheckoutOpen(true)}
            className="fixed inset-x-0 z-[95] mx-auto flex w-[calc(100%-2rem)] max-w-[420px] items-center justify-between rounded-[22px] px-5 py-3.5 text-white shadow-[0_16px_40px_rgba(225,6,0,0.4)]"
            style={{ background: 'linear-gradient(135deg,#E10600,#FF5A1F)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
          >
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/25 px-2 text-[13px] font-black">
              {cartCount}
            </span>
            <span className="font-black">{isAr ? 'عرض السلة' : 'View Cart'}</span>
            <CountUp value={cartTotal} format={money} className="font-display text-[15px] font-black" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* redeem / points toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="fixed inset-x-0 top-4 z-[300] mx-auto w-fit max-w-[90%] rounded-2xl bg-brand-ink px-5 py-3 text-center text-[13px] font-black text-white shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* hamburger drawer */}
      <AnimatePresence>
        {menuOpen && (
          <NavDrawer
            user={user}
            loyalty={loyalty}
            streak={streak}
            active={tab}
            isAr={isAr}
            branchName={branchLabel}
            onNavigate={setTab}
            onToggleLang={() => setLang(isAr ? 'en' : 'ar')}
            onAdmin={() => setShowAdminLogin(true)}
            onChangeBranch={() => {
              try {
                localStorage.removeItem('ba_branch');
              } catch {}
              setBranchId(null);
            }}
            onLogout={() => {
              try {
                localStorage.removeItem('ba_user');
              } catch {}
              setUser(null);
              setCart({});
              setTab('menu');
            }}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* checkout overlay */}
      <AnimatePresence>
        {checkoutOpen && user && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
            className="fixed inset-0 z-[200] overflow-y-auto bg-brand-cream"
          >
            <CheckoutStep
              cart={cart}
              user={user}
              isAr={isAr}
              defaultBranchId={branchId}
              onBack={() => setCheckoutOpen(false)}
              onOrderPlaced={onOrderPlaced}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* success popup modal */}
      <AnimatePresence>
        {lastOrder && (
          <OrderSuccess
            order={lastOrder}
            isAr={isAr}
            onNewOrder={() => {
              setCart({});
              setLastOrder(null);
              setTab('menu');
            }}
          />
        )}
      </AnimatePresence>

      {/* order tracking overlay */}
      <AnimatePresence>
        {trackOrder && (
          <OrderTrackingScreen
            order={trackOrder}
            isAr={isAr}
            onClose={() => setTrackOrder(null)}
            onRate={onRateOrder}
          />
        )}
      </AnimatePresence>

      {/* notifications sheet */}
      <AnimatePresence>
        {notifOpen && user && (
          <NotificationsSheet phone={user.phone} isAr={isAr} onClose={() => setNotifOpen(false)} />
        )}
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
        {streakTick && <StreakModal tick={streakTick} isAr={isAr} onClose={() => setStreakTick(null)} />}
      </AnimatePresence>

      <div className="pointer-events-none fixed bottom-1 left-0 right-0 z-[1] text-center text-[10px] font-medium tracking-wide text-brand-ink/40">
        v{APP_VERSION}
      </div>
    </div>
  );
}
