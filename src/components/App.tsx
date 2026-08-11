import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useScroll, useTransform } from 'framer-motion';
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
import StreakModal from './StreakModal';
import BranchSelectStep from './BranchSelectStep';
import { NotificationsBell, NotificationsSheet } from './NotificationsSheet';
import AnnouncementBanner from './AnnouncementBanner';
import BottomNav from './BottomNav';
import ErrorBoundary from './ErrorBoundary';

export type Tab = 'menu' | 'rewards' | 'orders' | 'account';
import { pageVariants } from './motion';
import { money, APP_VERSION } from '../lib/utils';
import { DEFAULT_MENU, BRANCHES, type Branch, type Menu } from '../lib/data';
import { filterMenuForBranch } from '../lib/items';
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

type User = { uid: string; name: string; phone: string };

function AppInner() {
  const [splash, setSplash] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>(BRANCHES);
  const [menu, setMenu] = useState<Menu>(DEFAULT_MENU);
  const [cart, setCart] = useState<Cart>({});
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [restaurantClosed, setRestaurantClosed] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>('menu');
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [streak, setStreak] = useState<StreakState>(loadStreak);
  const [streakTick, setStreakTick] = useState<StreakTick | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyState>(loadLoyalty);
  const [toast, setToast] = useState<string | null>(null);
  // Phase 13 — server-mirrored tier + order-streak + missions.
  const [serverTier, setServerTier] = useState<any | null>(null);
  const [orderStreak, setOrderStreak] = useState<any | null>(null);
  const [missions, setMissions] = useState<any[]>([]);
  const [missionStates, setMissionStates] = useState<any[]>([]);
  // Phase 14 — server-minted referral code + inbound-code attach.
  const [myRefCode, setMyRefCode] = useState<string | null>(null);
  const [myReferrals, setMyReferrals] = useState<any[]>([]);
  const orderCounter = useRef(1000);
  const isAr = lang === 'ar';

  useEffect(() => {
    try {
      const b = localStorage.getItem('ba_branch');
      if (b) setBranchId(b);
    } catch {}
    const t = tickStreak();
    setStreak(t.state);
    if (t.changed) setStreakTick(t);
    setLoyalty(loadLoyalty());
    // Subscribe to Firebase Auth. Anonymous sessions persist across reloads,
    // so a returning visitor whose customers/{uid} doc has name+phone skips
    // VerifyStep. A fresh visitor stays on VerifyStep until they submit.
    const unsub = FB.onAuth(async (au) => {
      setAuthReady(true);
      if (!au) {
        setUser(null);
        return;
      }
      const doc = await FB.getCustomer(au.uid);
      const nm = (doc?.name as string) || '';
      const ph = (doc?.phone as string) || '';
      if (nm && ph) setUser({ uid: au.uid, name: nm, phone: ph });
      else setUser(null); // profile not yet filled — force VerifyStep
      // Hydrate loyalty from the server (sum across every customer doc on
      // this phone — anon churn scatters points across sibling uids until
      // Phase 10 merges them). Restrictive browsers nuke localStorage on
      // refresh so local state defaults to zero; the server total is the
      // durable one — surface it.
      const serverPts = ph ? await FB.getLoyaltyByPhone(ph) : Number((doc as any)?.loyaltyPoints) || 0;
      if (serverPts > 0) {
        setLoyalty((prev) => {
          if (serverPts <= prev.lifetime) return prev;
          const next = { points: serverPts, lifetime: serverPts, history: prev.history, redeemed: prev.redeemed };
          try { localStorage.setItem('ba_loyalty_v1', JSON.stringify(next)); } catch {}
          return next;
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let unsubMenu = () => {};
    let unsubSettings = () => {};
    let unsubBranches = () => {};
    (async () => {
      const m = await FB.getMenu();
      if (m) setMenu(m);
      const s = await FB.getSettings();
      if (s && s.isOpen === false) setRestaurantClosed(true);
      // Live branches from Firestore. Fall back to hardcoded BRANCHES when the collection is empty.
      const seedBranches = await FB.getBranches();
      if (seedBranches.length) setBranches(seedBranches);
      unsubBranches = FB.onBranchesChange((bs) => {
        // Hide branches the admin has flagged inactive. `active === false`
        // is opt-out; missing/true means visible so pre-Phase-4 rows keep
        // showing without a migration.
        const visible = bs.filter((b) => (b as any).active !== false);
        if (visible.length) setBranches(visible);
      });
      unsubMenu = FB.onMenuChange((mm) => mm && setMenu(mm));
      unsubSettings = FB.onSettingsChange((ss) => setRestaurantClosed(ss.isOpen === false));
    })();
    return () => {
      unsubMenu();
      unsubSettings();
      unsubBranches();
    };
  }, []);

  // Menu filtered to the customer's selected branch — respects admin-set per-branch availability.
  const menuForBranch = useMemo(() => filterMenuForBranch(menu, branchId), [menu, branchId]);

  // Load persisted orders + subscribe to live updates for this user. Keyed
  // by phone so history follows the customer to a new device/browser once
  // they re-enter their number.
  useEffect(() => {
    if (!user?.phone) return;
    let cancelled = false;
    (async () => {
      const rows = await FB.getCustomerOrders(user.phone, user.uid);
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
        totals: r.totals || { subtotal: 0, pFee: 0, discount: 0, vat: 0, total: r.total || 0 },
        fbId: r.fbId,
        status: r.status || 'new',
        rating: r.rating || null,
      }));
      setOrders(shaped);
    })();
    // Live-subscribe to this customer's orders (server-filtered by phone).
    // Patches status/rating on ones we already have and folds in any that
    // aren't in local state yet (e.g. orders placed from another device).
    const unsub = FB.onMyOrdersChange(user.phone, user.uid, (mine) => {
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
          } else {
            map.set(k, {
              orderNo: o.orderNo || '000000',
              date: o.date || new Date((o.createdAt?.seconds || 0) * 1000).toISOString(),
              user: { name: o.userName || user.name, phone: o.userPhone || user.phone },
              branchObj: o.branchObj || { nameEn: o.branch || '' },
              orderType: o.orderType || 'pickup',
              pickupTime: o.pickupTime || '',
              paymentMethod: o.paymentMethod || 'cash',
              couponCode: o.couponCode || '',
              items: o.items || [],
              totals: o.totals || { subtotal: 0, pFee: 0, discount: 0, vat: 0, total: o.total || 0 },
              fbId: o.fbId,
              status: o.status || 'new',
              rating: o.rating || null,
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
  }, [user?.phone, user?.uid, user?.name]);

  // Phase 13 — subscribe to the customer's server-computed tier + order streak
  // (mirrored on customers/{uid}) and the active mission list. All server
  // reads gated on rules — a missing snapshot leaves state at null which the
  // UI treats as "not yet loaded" and falls back to the local ladder.
  useEffect(() => {
    if (!user?.uid) return;
    const unsubCust = FB.onMyCustomerChange(user.uid, (d) => {
      if (!d) return;
      if (d.tier) setServerTier(d.tier);
      if (d.streak) setOrderStreak(d.streak);
      // Cross-device loyalty sync — the server ledger is the source of
      // truth for `points`, and every device that watches this doc will
      // see a redemption debit or an order earn as soon as the mirror
      // write lands. Without this, device B kept showing the localStorage
      // balance from device A's last session.
      const serverPts   = Number((d as any).points);
      const serverLife  = Number((d as any).lifetimeSpend);
      if (Number.isFinite(serverPts) || Number.isFinite(serverLife)) {
        setLoyalty((prev) => {
          const points   = Number.isFinite(serverPts)  ? serverPts  : prev.points;
          const lifetime = Number.isFinite(serverLife) ? Math.max(serverLife, prev.lifetime) : prev.lifetime;
          if (points === prev.points && lifetime === prev.lifetime) return prev;
          const next = { points, lifetime, history: prev.history, redeemed: prev.redeemed };
          try { localStorage.setItem('ba_loyalty_v1', JSON.stringify(next)); } catch {}
          return next;
        });
      }
    });
    const unsubMissions = FB.onActiveMissionsChange((ms) => setMissions(ms));
    const unsubMissionStates = FB.onMyMissionStatesChange(user.uid, (st) => setMissionStates(st));
    const unsubReferrals = FB.onMyReferralsChange(user.uid, (rs) => setMyReferrals(rs));
    return () => {
      unsubCust();
      unsubMissions();
      unsubMissionStates();
      unsubReferrals();
    };
  }, [user?.uid]);

  // Phase 14 — capture ?ref=<code> from the URL on the first render (before
  // sign-in), stash it in sessionStorage so it survives the VerifyStep
  // roundtrip, then attach it AFTER the customer profile is filled AND we
  // haven't already attached. Once attached, clear the stash.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get('ref');
      if (ref && !sessionStorage.getItem('ba_ref_pending')) {
        sessionStorage.setItem('ba_ref_pending', ref.trim().toUpperCase());
        // Scrub the querystring so bookmarks / shares don't leak the code.
        url.searchParams.delete('ref');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      const code = await FB.getMyReferralCode();
      if (!cancelled) setMyRefCode(code || null);
      let pending: string | null = null;
      try { pending = sessionStorage.getItem('ba_ref_pending'); } catch {}
      if (pending && !cancelled) {
        const res = await FB.attachReferralCode(pending);
        // Consume the pending code even on failure — a bad code shouldn't
        // keep retrying on every reload.
        try { sessionStorage.removeItem('ba_ref_pending'); } catch {}
        if (res.ok) {
          showToast(isAr ? '🎁 مكافأة الترحيب بانتظارك بعد أول طلب' : '🎁 Welcome bonus after your first order');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const showToast = (msg: string) => {
    setToast(msg);
    // Error toasts (start with the ⚠️ warning glyph) stick around for 12s so
    // the customer actually sees them; celebratory ones dismiss after 3.2s.
    const isError = /^\s*⚠️/.test(msg);
    setTimeout(() => setToast(null), isError ? 12000 : 3200);
  };

  // Post-OTP callback — Firebase Auth has persisted the session; onAuth will refresh `user`,
  // but we set it optimistically so the UI advances without a round-trip.
  const onVerified = (u: User) => setUser(u);

  // Guards against a re-entrant tap on Place Order (fast double-tap, an
  // accidental re-render, or an event that fires twice). Two invocations
  // used to consume two counter ticks and race the writes; now the second
  // one no-ops until the first settles.
  const placingRef = useRef(false);
  const onOrderPlaced = async (payload: any) => {
    if (placingRef.current) return;
    placingRef.current = true;
    setCheckoutOpen(false);
    try {
      // saveOrder is the single minter of orderNo now — waiting on it also
      // guarantees the confetti screen shows the number that persisted.
      const saved = await FB.saveOrder({
        ...payload,
        userUid: user!.uid,
        userName: payload.user.name,
        userPhone: payload.user.phone,
        total: payload.totals.total,
        date: new Date().toISOString(),
        clientOrderId: payload.clientOrderId,
      });
      // Hard-fail branch. Without an fbId the submitOrder callable never
      // wrote to Firestore — the admin will never see this order. Surface
      // the error prominently instead of showing the success confetti with
      // an empty order number: that dead-end used to swallow every
      // "functions not deployed" / "permission denied" / "invalid payload"
      // outcome silently. Rethrow the checkout back into place so the
      // customer can retry (or send us the exact error).
      if (!saved.fbId) {
        const err = saved.error || 'unknown-error';
        try { console.error('[order] submitOrder failed:', err); } catch {}
        showToast(
          isAr
            ? `⚠️ لم يُحفظ الطلب — حاول مرة أخرى (${err})`
            : `⚠️ Order not saved — please try again (${err})`,
        );
        setCheckoutOpen(true);
        return;
      }
      const orderNo = saved.orderNo;
      const order: Order = {
        ...payload,
        orderNo,
        date: new Date().toISOString(),
        status: 'new',
        fbId: saved.fbId,
      };
      setOrders((prev) => [order, ...prev]);
      setLastOrder(order);
      const earned = pointsForOrder(order.totals.total, loyalty.lifetime);
      setLoyalty(addPoints(earned, `Order #${orderNo}`));
      if (user?.uid)
        FB.saveCustomer({
          uid: user.uid,
          name: user.name,
          phone: user.phone,
          loyaltyPoints: earned,
          lastAddress: payload.address || '',
        });
      showToast(isAr ? `+${earned} نقطة 🎁` : `+${earned} points 🎁`);
    } finally {
      placingRef.current = false;
    }
  };

  const [trackOrder, setTrackOrder] = useState<Order | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const onRateOrder = (fbId: string, stars: number, comment: string) => {
    FB.saveOrderRating(fbId, stars, comment);
    setOrders((prev) => prev.map((o) => (o.fbId === fbId ? { ...o, rating: { stars, comment } } : o)));
  };

  const onRedeem = async (r: Reward) => {
    // Server-side redeem — debits customers/{uid}.points via the ledger
    // and mints a Phase-11 token the customer can enter on checkout. Without
    // this, a redemption on device A was invisible to device B (local-only
    // debit) and the customer could double-spend the same balance.
    if (loyalty.points < r.cost) {
      showToast(isAr ? '❌ نقاط غير كافية' : '❌ Not enough points');
      return;
    }
    const kind = r.counter ? 'perk' : 'coupon';
    const server = await FB.redeemPointsForReward({
      cost: r.cost,
      label: isAr ? r.titleAr : r.title,
      kind,
      value: 0,
      expiresInDays: 30,
    });
    if (!server || !server.ok) {
      const reason = server && server.error ? String(server.error) : 'unknown-error';
      showToast(isAr ? `⚠️ تعذّر الاستبدال (${reason})` : `⚠️ Redeem failed (${reason})`);
      return;
    }
    // Optimistic local mirror so the hero updates instantly; the live
    // customer-doc subscription will reconcile against the server value.
    const local = redeem(r.id);
    if (local.ok) setLoyalty(local.state);
    const issuedCode = server.code || r.code;
    showToast(
      isAr
        ? `تم! استخدم الرمز ${issuedCode} ${r.counter ? '(عند الفرع)' : 'عند الدفع'}`
        : `Unlocked! Use ${issuedCode} ${r.counter ? '(at counter)' : 'at checkout'}`,
    );
  };

  const cartCount = Object.values(cart).reduce((s, i) => s + (i.qty || 0), 0);
  const cartTotal = Object.values(cart).reduce((s, i) => s + i.price * (i.qty || 0), 0);
  const cartCtrl = useAnimationControls();
  const prevCartCount = useRef(cartCount);
  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      cartCtrl.start({
        scale: [1, 1.06, 0.98, 1],
        transition: { duration: 0.36, times: [0, 0.35, 0.7, 1], ease: 'easeOut' },
      });
    }
    prevCartCount.current = cartCount;
  }, [cartCount, cartCtrl]);
  const currentBranch = branches.find((b) => b.id === branchId);
  const branchLabel = currentBranch ? (isAr ? currentBranch.nameAr : currentBranch.nameEn) : null;

  // scroll-reactive header + progress bar
  const { scrollY, scrollYProgress } = useScroll();
  const headerShadow = useTransform(scrollY, [0, 60], ['0 0 0 rgba(0,0,0,0)', '0 12px 30px rgba(180,60,0,0.14)']);
  const headerBlur = useTransform(scrollY, [0, 60], ['saturate(1) blur(6px)', 'saturate(1.2) blur(16px)']);

  if (splash || !authReady) {
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
    return <BranchSelectStep isAr={isAr} onSelect={(id) => setBranchId(id)} branches={branches} />;
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
              {branchLabel ? (
                <div className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-brand-red">
                  <span aria-hidden>📍</span>
                  <span className="max-w-[140px] truncate">{branchLabel}</span>
                </div>
              ) : (
                <div className="mt-0.5 font-arabic text-[12px] font-bold text-brand-red">بروست البحر</div>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell phone={user.phone} isAr={isAr} onOpen={() => setNotifOpen(true)} />
            {/* points + streak — informational chip. Full Rewards screen lives in the bottom nav. */}
            <button
              onClick={() => setTab('rewards')}
              aria-label={isAr ? 'المكافآت' : 'Rewards'}
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

      {/* live manager announcement */}
      <AnnouncementBanner isAr={isAr} />

      {/* tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} variants={pageVariants} initial="initial" animate="animate" exit="exit">
          {tab === 'menu' && (
            <MenuStep menu={menuForBranch} cart={cart} setCart={setCart} user={user} isAr={isAr} restaurantClosed={restaurantClosed} />
          )}
          {tab === 'rewards' && <RewardsScreen loyalty={loyalty} streak={streak} isAr={isAr} uid={user?.uid} onRedeem={onRedeem} />}
          {tab === 'orders' && (
            <OrdersScreen orders={orders} isAr={isAr} onReorder={() => setTab('menu')} onTrack={(o) => setTrackOrder(o)} />
          )}
          {tab === 'account' && (
            <AccountScreen
              user={user}
              loyalty={loyalty}
              streak={streak}
              isAr={isAr}
              serverTier={serverTier}
              orderStreak={orderStreak}
              missions={missions}
              missionStates={missionStates}
              myRefCode={myRefCode}
              myReferrals={myReferrals}
              onToggleLang={() => setLang(isAr ? 'en' : 'ar')}
              onLogout={async () => {
                await FB.signOut();
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
            className="cart-fab fixed inset-x-0 z-[95] mx-auto flex w-[calc(100%-2rem)] max-w-[420px] items-center justify-between rounded-[22px] px-5 py-3.5 text-white shadow-[0_16px_40px_rgba(225,6,0,0.4)]"
            style={{ background: 'linear-gradient(135deg,#E10600,#FF5A1F)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
          >
            <motion.span
              animate={cartCtrl}
              key={cartCount}
              initial={false}
              className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/25 px-2 text-[13px] font-black"
            >
              {cartCount}
            </motion.span>
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
            onChangeBranch={() => {
              try {
                localStorage.removeItem('ba_branch');
              } catch {}
              setBranchId(null);
            }}
            onLogout={async () => {
              await FB.signOut();
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
              setCart={setCart}
              user={user}
              isAr={isAr}
              defaultBranchId={branchId}
              branches={branches}
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
        {streakTick && <StreakModal tick={streakTick} isAr={isAr} onClose={() => setStreakTick(null)} />}
      </AnimatePresence>

      {/* Bottom navigation — hidden while a fullscreen overlay owns the viewport */}
      {!checkoutOpen && !trackOrder && !lastOrder && (
        <BottomNav
          active={tab}
          isAr={isAr}
          ordersCount={orders.length}
          points={loyalty.points}
          onChange={setTab}
        />
      )}

      <div
        className="pointer-events-none fixed inset-x-0 z-[1] text-center text-[10px] font-medium tracking-wide text-brand-ink/40"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)' }}
      >
        v{APP_VERSION}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
