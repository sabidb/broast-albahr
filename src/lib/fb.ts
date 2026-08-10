// Firebase integration. All Firestore calls are guarded so the UI works
// offline / without Firestore access. Phase 2 also handles Firebase Auth (phone)
// and App Check (reCAPTCHA v3).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut as fbSignOut,
  updateProfile,
  type Auth,
  type User as FbUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  getDocs,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
  runTransaction,
  arrayUnion,
  arrayRemove,
  query,
  where,
  orderBy,
  limit,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import type { Branch, Menu } from './data';
import { validateCustomer, validateBranch, SchemaError } from './schema';
import { deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB2PqybuRwuBjDQHgl1r9iFOC5b5lr81-s',
  authDomain: 'broast-al-bahr.firebaseapp.com',
  projectId: 'broast-al-bahr',
  storageBucket: 'broast-al-bahr.firebasestorage.app',
  messagingSenderId: '663849043584',
  appId: '1:663849043584:web:b15e0a32eb9b6353830865',
};

// App Check site key. Public by design (ends up in the JS bundle). Overridable
// per environment via `PUBLIC_APP_CHECK_SITE_KEY` in Vercel.
const APP_CHECK_SITE_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_APP_CHECK_SITE_KEY) ||
  '6Le9EX0tAAAAABxsStKat6oX8bqJ_ny1Pbrj93kQ';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;
let fns: Functions | null = null;
try {
  app = initializeApp(firebaseConfig);
  // ignoreUndefinedProperties: schema.ts validators (validateOrder etc)
  // build objects like { nameAr: undefined } when optional fields are
  // absent. Without this flag Firestore's SDK throws synchronously on
  // setDoc — the entire write silently failed, the customer saw the
  // success screen, admin never got the order. See the "order 100007"
  // debug session for the full story.
  try {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    // A prior module already initialized it — fall back to the singleton,
    // which will already have (or lack) the flag from whoever won the race.
    db = getFirestore(app);
  }
  storage = getStorage(app);
  auth = getAuth(app);
  // Callables live in me-west1 alongside Firestore. Phase 5 uses `submitOrder`
  // and `updateOrderStatus` for server-side order writes.
  try { fns = getFunctions(app, 'me-west1'); } catch { fns = null; }
  // App Check runs in the browser only; skip during SSR / tests.
  if (typeof window !== 'undefined') {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // App Check may not yet be enabled in the Firebase console; fail open.
    }
  }
} catch {
  db = null;
  storage = null;
  auth = null;
}

type Unsub = () => void;
const noop: Unsub = () => {};

export interface SavedAddress {
  id: string;
  label: string;
  line: string;
  locationLink?: string;
}

export interface AuthUser {
  uid: string;
}

function shape(u: FbUser | null): AuthUser | null {
  if (!u) return null;
  return { uid: u.uid };
}

export const FB = {
  ready: () => !!db,
  authReady: () => !!auth,

  /** Subscribe to Firebase Auth state changes. Cb receives the shaped user or null. */
  onAuth(cb: (u: AuthUser | null) => void): Unsub {
    if (!auth) {
      cb(null);
      return noop;
    }
    return onAuthStateChanged(auth, (u) => cb(shape(u)));
  },

  async signOut() {
    if (!auth) return;
    try {
      await fbSignOut(auth);
    } catch {}
  },

  /**
   * Silently create (or restore) an anonymous session. No captcha, no SMS —
   * every visitor gets a stable Firebase UID that rules can key on.
   * Returns the shaped AuthUser.
   */
  async signInAnon(): Promise<AuthUser | null> {
    if (!auth) throw new Error('auth-unavailable');
    if (auth.currentUser) return shape(auth.currentUser);
    const cred = await signInAnonymously(auth);
    return shape(cred.user);
  },

  /** Set the visible display name on the current auth user. */
  async setDisplayName(name: string) {
    if (!auth?.currentUser) return;
    try { await updateProfile(auth.currentUser, { displayName: name }); } catch {}
  },

  async getMenu(): Promise<Menu | null> {
    if (!db) return null;
    try {
      const s = await getDoc(doc(db, 'settings', 'menu'));
      return s.exists() ? (s.data().menu as Menu) : null;
    } catch {
      return null;
    }
  },

  async saveMenu(menu: Menu) {
    if (!db) return;
    try {
      await setDoc(doc(db, 'settings', 'menu'), { menu, updatedAt: serverTimestamp() });
    } catch {}
  },

  /** Upload a product photo to Firebase Storage, return its download URL. */
  async uploadItemImage(itemId: string | number, file: File): Promise<string> {
    if (!storage) throw new Error('storage-unavailable');
    const safe = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const r = storageRef(storage, `items/${itemId}-${Date.now()}-${safe}`);
    await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
    return getDownloadURL(r);
  },

  async getSettings(): Promise<{ isOpen: boolean }> {
    if (!db) return { isOpen: true };
    try {
      const s = await getDoc(doc(db, 'settings', 'restaurant'));
      return s.exists() ? (s.data() as { isOpen: boolean }) : { isOpen: true };
    } catch {
      return { isOpen: true };
    }
  },

  /** Update restaurant settings (e.g. open/closed) — syncs live to clients. */
  async saveSettings(d: { isOpen: boolean }) {
    if (!db) return;
    try {
      await setDoc(doc(db, 'settings', 'restaurant'), { ...d, updatedAt: serverTimestamp() }, { merge: true });
    } catch {}
  },

  /** Atomic per-branch order counter starting at 100000. Increments by exactly 1. */
  async nextOrderNo(branchId?: string): Promise<string> {
    const counterId = branchId ? `orderNo-${branchId}` : 'orderNo';
    const lsKey = `ba_orderNo_${counterId}`;
    // localStorage keeps the sequence continuous on this device even if the
    // Firestore transaction is briefly denied — never falls back to random.
    const readLocal = () => {
      try {
        const v = Number(localStorage.getItem(lsKey) || '99999');
        return Number.isFinite(v) && v >= 99999 ? v : 99999;
      } catch { return 99999; }
    };
    const writeLocal = (n: number) => { try { localStorage.setItem(lsKey, String(n)); } catch {} };

    if (db) {
      try {
        const ref = doc(db, 'counters', counterId);
        const next = await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const local = readLocal();
          const remote = snap.exists() ? (snap.data().value as number) : 99999;
          const cur = Math.max(local, remote);
          const nxt = cur + 1;
          tx.set(ref, { value: nxt, updatedAt: serverTimestamp() }, { merge: true });
          return nxt;
        });
        writeLocal(next);
        return String(next).padStart(6, '0');
      } catch {
        // Firestore denied or offline — bump the local sequence instead.
      }
    }
    const nxt = readLocal() + 1;
    writeLocal(nxt);
    return String(nxt).padStart(6, '0');
  },

  /**
   * Submit a new order via the `submitOrder` callable (Phase 5).
   *
   * The client sends only the branch, the per-item id + qty + note, the
   * chosen payment/pickup slot and the coupon code. Everything else — item
   * prices, availability, totals, VAT, orderNo, statusHistory — is looked up
   * and computed by the Cloud Function against Firestore-side data. Prices
   * can no longer be manipulated from the browser.
   *
   * Idempotent on `clientOrderId`: a retried tap returns the original doc
   * instead of minting a new orderNo.
   */
  async saveOrder(o: Record<string, unknown>): Promise<{ fbId: string | null; orderNo: string; error?: string }> {
    const clientOrderId = (o.clientOrderId as string) || '';
    if (!fns) return { fbId: null, orderNo: '', error: 'functions-unavailable' };
    const rawItems = Array.isArray(o.items) ? (o.items as any[]) : [];
    const itemsPayload = rawItems.map((it) => {
      const trim: any = { id: it?.id, qty: Number(it?.qty) };
      if (it?.note) trim.note = String(it.note);
      return trim;
    });
    const payload: Record<string, unknown> = {
      clientOrderId,
      branch: String(o.branch || ''),
      items: itemsPayload,
      paymentMethod: (o.paymentMethod as string) || 'cash',
      orderType: (o.orderType as string) || 'pickup',
    };
    if (o.pickupTime) payload.pickupTime = String(o.pickupTime);
    if (o.note) payload.note = String(o.note);
    if (o.couponCode) payload.couponCode = String(o.couponCode);
    try {
      const call = httpsCallable<Record<string, unknown>, { fbId: string; orderNo: string; status: string; existing: boolean }>(fns, 'submitOrder');
      const res = await call(payload);
      const d = res.data;
      return { fbId: d.fbId, orderNo: d.orderNo };
    } catch (err: any) {
      const code = err?.code || err?.name || 'unknown';
      const msg = err?.details?.message || err?.message || String(err);
      try { console.error('[FB.saveOrder] submitOrder failed:', code, msg, err); } catch {}
      return { fbId: null, orderNo: '', error: `${code}: ${msg}` };
    }
  },

  /**
   * Change an order's status via the `updateOrderStatus` callable (Phase 5).
   * The server enforces the allowed-transition table and role-scoped
   * authorization. Customers can only invoke this to cancel their own order
   * while it is still `new` or `pending`; everything else is staff-only.
   */
  async updateOrderStatus(orderId: string, status: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
    if (!fns) return { ok: false, error: 'functions-unavailable' };
    try {
      const call = httpsCallable<{ orderId: string; status: string; reason?: string }, { ok: boolean; status: string }>(fns, 'updateOrderStatus');
      await call({ orderId, status, reason });
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || err?.name || 'unknown';
      const msg = err?.details?.message || err?.message || String(err);
      try { console.error('[FB.updateOrderStatus] failed:', code, msg); } catch {}
      return { ok: false, error: `${code}: ${msg}` };
    }
  },

  /** Convenience wrapper for the customer-side cancel button. */
  async cancelMyOrder(orderId: string, reason?: string) {
    return FB.updateOrderStatus(orderId, 'cancelled', reason);
  },

  /**
   * Phase 11 — validate a reward code / QR payload for the current customer.
   * Read-only preview; use reserveRewardCode to actually hold it during
   * checkout. Returns { ok, code, reward, error } — the caller flashes a
   * green / red state under the code input.
   */
  async validateRewardCode(input: { codeOrPayload: string; branchId?: string; orderTotal?: number }): Promise<any> {
    if (!fns) return { ok: false, error: 'functions-unavailable' };
    try {
      const call = httpsCallable<any, any>(fns, 'validateRewardCode');
      const res = await call(input);
      return res.data;
    } catch (err: any) {
      const code = err?.code || err?.name || 'unknown';
      return { ok: false, error: `${code}: ${err?.message || String(err)}` };
    }
  },

  async reserveRewardCode(input: { codeOrPayload: string; orderId: string; branchId?: string; orderTotal?: number }): Promise<any> {
    if (!fns) return { ok: false, error: 'functions-unavailable' };
    try {
      const call = httpsCallable<any, any>(fns, 'reserveRewardCode');
      const res = await call(input);
      return res.data;
    } catch (err: any) {
      const code = err?.code || err?.name || 'unknown';
      return { ok: false, error: `${code}: ${err?.message || String(err)}` };
    }
  },

  /**
   * Phase 11 — read the customer's live reward tokens (AVAILABLE only).
   * Returns the tokens keyed on their uid, most recent first.
   */
  async getMyRewardTokens(uid: string): Promise<Array<{ code: string; label: string; expiresAt: string; kind?: string; value?: number }>> {
    if (!db || !uid) return [];
    try {
      const q = query(
        collection(db, 'rewardTokens'),
        where('customerUid', '==', uid),
        where('status', '==', 'available'),
      );
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ code: d.id, ...(d.data() as any) }))
        .filter((t) => !t.expiresAt || new Date(t.expiresAt).getTime() > Date.now())
        .sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
      return rows.map((t) => ({ code: t.code, label: t.label || 'Reward', expiresAt: t.expiresAt, kind: t.kind, value: t.value }));
    } catch (err) {
      try { console.error('[FB.getMyRewardTokens] read failed', err); } catch {}
      return [];
    }
  },

  /**
   * Phase 12 — recent ledger entries for this customer (newest first).
   * Used by the Rewards screen "Activity" section to show server-truth
   * points history instead of the localStorage cache.
   */
  async getMyPointsLedger(uid: string, limitN = 20): Promise<Array<{ delta: number; reason: string; at: string; source: string }>> {
    if (!db || !uid) return [];
    try {
      const q = query(
        collection(db, 'pointsLedger'),
        where('customerUid', '==', uid),
        orderBy('at', 'desc'),
        limit(limitN),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const x = d.data() as any;
        return { delta: Number(x.delta) || 0, reason: String(x.reason || ''), at: String(x.at || ''), source: String(x.source || '') };
      });
    } catch (err) {
      try { console.error('[FB.getMyPointsLedger] read failed', err); } catch {}
      return [];
    }
  },

  /**
   * Phase 12 — read the server-side points balance from customers/{uid}.
   * The Rewards screen prefers this over the localStorage cache when both
   * exist (the ledger is the source of truth).
   */
  async getMyPointsBalance(uid: string): Promise<number> {
    if (!db || !uid) return 0;
    try {
      const s = await getDoc(doc(db, 'customers', uid));
      if (!s.exists()) return 0;
      const n = Number((s.data() as any).points);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  },

  /**
   * Phase 12 — redeem points for a reward. Server-side: debits the ledger
   * and mints a Phase-11 token (12-char code + QR) in one call. The customer
   * uses the returned code on their next order.
   */
  async redeemPointsForReward(input: { cost: number; label: string; kind: string; value?: number; productId?: string | number; expiresInDays?: number }): Promise<any> {
    if (!fns) return { ok: false, error: 'functions-unavailable' };
    try {
      const call = httpsCallable<any, any>(fns, 'redeemPointsForReward');
      const res = await call(input);
      return res.data;
    } catch (err: any) {
      const code = err?.code || err?.name || 'unknown';
      return { ok: false, error: `${code}: ${err?.details?.message || err?.message || String(err)}` };
    }
  },

  /**
   * Register (or refresh) an FCM device token with the customer profile
   * so server-side dispatchNotification can push to them. No-op if the
   * browser hasn't granted permission or the VAPID key isn't configured
   * yet — the in-app inbox always works either way.
   */
  async registerFcmToken(token: string): Promise<{ ok: boolean; error?: string }> {
    if (!fns) return { ok: false, error: 'functions-unavailable' };
    if (!token) return { ok: false, error: 'no-token' };
    try {
      const call = httpsCallable<{ token: string }, { ok: boolean }>(fns, 'registerFcmToken');
      await call({ token });
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || err?.name || 'unknown';
      const msg = err?.details?.message || err?.message || String(err);
      try { console.error('[FB.registerFcmToken] failed:', code, msg); } catch {}
      return { ok: false, error: `${code}: ${msg}` };
    }
  },

  async saveCustomer(d: {
    uid: string;
    name: string;
    phone: string;
    loyaltyPoints?: number;
    firstSeen?: string;
    lastAddress?: string;
  }) {
    if (!db) return;
    try {
      // Schema guard on the strict fields; loyaltyPoints becomes an increment
      // sentinel below, which validateCustomer accepts as-is (opaque server value).
      const validated = validateCustomer(d as unknown as Record<string, unknown>);
      const data: Record<string, unknown> = { ...validated, lastSeen: serverTimestamp() };
      if (typeof d.loyaltyPoints === 'number' && d.loyaltyPoints > 0) {
        data.loyaltyPoints = increment(d.loyaltyPoints);
      }
      await setDoc(doc(db, 'customers', d.uid), data, { merge: true });
    } catch (err) {
      const msg = err instanceof SchemaError ? err.message : String(err);
      try { console.error('[FB.saveCustomer] rejected:', msg); } catch {}
    }
  },

  /**
   * Sum loyaltyPoints across every customer doc that carries this phone.
   * Anonymous re-installs mint fresh customer docs per uid, so a single
   * real person can end up with several sibling docs — each holding only
   * what its uid earned. This aggregates them so the visible balance
   * reflects everything the customer has ever earned on this number.
   */
  async getLoyaltyByPhone(phone: string): Promise<number> {
    if (!db || !phone) return 0;
    try {
      const snap = await getDocs(query(collection(db, 'customers'), where('phone', '==', phone)));
      let sum = 0;
      snap.docs.forEach((d) => {
        // Phase 12 mirrors the ledger balance onto customers/{uid}.points
        // (source of truth). Fall back to the legacy loyaltyPoints field
        // for customer docs that predate the ledger rollout.
        const data = d.data() as any;
        const n = Number(data?.points ?? data?.loyaltyPoints) || 0;
        if (n > 0) sum += n;
      });
      return sum;
    } catch (err) {
      try { console.error('[FB.getLoyaltyByPhone] read failed', err); } catch {}
      return 0;
    }
  },

  async getCustomer(uid: string): Promise<Record<string, unknown> | null> {
    if (!db) return null;
    try {
      const s = await getDoc(doc(db, 'customers', uid));
      return s.exists() ? (s.data() as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  },

  async addCustomerAddress(uid: string, a: SavedAddress) {
    if (!db) return;
    try {
      await setDoc(doc(db, 'customers', uid), { addresses: arrayUnion(a) }, { merge: true });
    } catch {}
  },

  async removeCustomerAddress(uid: string, a: SavedAddress) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'customers', uid), { addresses: arrayRemove(a) });
    } catch {}
  },

  /**
   * All orders belonging to a customer. Runs both a uid-scoped query (for
   * the current anon session) and a phone-scoped query (for prior sessions
   * on other devices) in parallel and unions the results. Either query may
   * legitimately return empty; whichever succeeds contributes rows. Falling
   * back to the union means one rule quirk can't wipe the whole history.
   */
  async getCustomerOrders(phone: string, uid?: string): Promise<Record<string, unknown>[]> {
    if (!db || (!phone && !uid)) return [];
    const rows = new Map<string, Record<string, unknown>>();
    const results = await Promise.allSettled([
      phone
        ? getDocs(query(collection(db, 'orders'), where('userPhone', '==', phone)))
        : Promise.resolve(null as any),
      uid
        ? getDocs(query(collection(db, 'orders'), where('userUid', '==', uid)))
        : Promise.resolve(null as any),
    ]);
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        r.value.docs.forEach((d: any) => rows.set(d.id, { fbId: d.id, ...d.data() }));
      } else if (r.status === 'rejected') {
        const which = i === 0 ? 'phone' : 'uid';
        try { console.error(`[FB.getCustomerOrders] ${which} query failed`, r.reason); } catch {}
      }
    });
    return Array.from(rows.values())
      .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  },

  onMenuChange(cb: (m: Menu) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(doc(db, 'settings', 'menu'), (s) => {
        if (s.exists()) cb(s.data().menu as Menu);
      });
    } catch {
      return noop;
    }
  },

  /** Live stream of orders (newest first). Pass `branchId` to scope the stream to one branch (Phase 4 will require this). */
  onOrdersChange(cb: (orders: any[]) => void, branchId?: string | null): Unsub {
    if (!db) return noop;
    try {
      const ref = branchId
        ? query(collection(db, 'orders'), where('branch', '==', branchId))
        : collection(db, 'orders');
      return onSnapshot(ref, (s) => {
        const o = s.docs.map((d) => ({ fbId: d.id, ...d.data() }));
        o.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        cb(o);
      });
    } catch {
      return noop;
    }
  },

  /**
   * Live stream of a specific customer's orders. Two subscriptions in parallel
   * (uid and phone) so we survive rule quirks and cover both same-session and
   * cross-device history. Rows are unioned by fbId before every cb.
   */
  onMyOrdersChange(phone: string, uid: string | undefined, cb: (orders: any[]) => void): Unsub {
    if (!db || (!phone && !uid)) return noop;
    const rows = new Map<string, any>();
    const emit = () => {
      const arr = Array.from(rows.values());
      arr.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      cb(arr);
    };
    const subs: Unsub[] = [];
    const mkSub = (field: 'userPhone' | 'userUid', value: string) => {
      try {
        const u = onSnapshot(
          query(collection(db!, 'orders'), where(field, '==', value)),
          (s) => {
            s.docs.forEach((d) => rows.set(d.id, { fbId: d.id, ...d.data() }));
            emit();
          },
          (err) => { try { console.error(`[FB.onMyOrdersChange] ${field} stream error`, err); } catch {} },
        );
        subs.push(u);
      } catch (err) {
        try { console.error(`[FB.onMyOrdersChange] ${field} subscribe threw`, err); } catch {}
      }
    };
    if (phone) mkSub('userPhone', phone);
    if (uid) mkSub('userUid', uid);
    return () => subs.forEach((u) => u());
  },

  /** Live single-order subscription for the customer tracker. */
  subscribeOrder(fbId: string, cb: (o: any | null) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(doc(db, 'orders', fbId), (s) => {
        cb(s.exists() ? { fbId: s.id, ...s.data() } : null);
      });
    } catch {
      return noop;
    }
  },

  /** Save customer rating + comment on a completed order. */
  async saveOrderRating(fbId: string, stars: number, comment: string) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'orders', fbId), {
        rating: { stars, comment, at: serverTimestamp() },
      });
    } catch {}
  },

  onSettingsChange(cb: (s: { isOpen: boolean }) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(doc(db, 'settings', 'restaurant'), (s) => {
        if (s.exists()) cb(s.data() as { isOpen: boolean });
      });
    } catch {
      return noop;
    }
  },

  /** Admin writes a notification into a customer's inbox. */
  async sendNotification(phone: string, n: { title: string; titleAr?: string; body: string; bodyAr?: string; kind?: string; orderNo?: string }) {
    if (!db) return;
    try {
      await addDoc(collection(db, 'notifications', phone, 'items'), {
        ...n,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch {}
  },

  subscribeNotifications(phone: string, cb: (rows: any[]) => void): Unsub {
    if (!db) return noop;
    try {
      const q1 = query(collection(db, 'notifications', phone, 'items'), orderBy('createdAt', 'desc'), limit(50));
      return onSnapshot(q1, (s) => {
        cb(s.docs.map((d) => ({ fbId: d.id, ...d.data() })));
      });
    } catch {
      return noop;
    }
  },

  async markNotificationRead(phone: string, fbId: string) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'notifications', phone, 'items', fbId), { read: true });
    } catch {}
  },

  async markAllNotificationsRead(phone: string) {
    if (!db) return;
    try {
      const q1 = query(collection(db, 'notifications', phone, 'items'), where('read', '==', false));
      const snap = await getDocs(q1);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
    } catch {}
  },

  /** Live subscription to the `branches` collection (Phase 4 replaces the hardcoded list). */
  onBranchesChange(cb: (branches: Branch[]) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(collection(db, 'branches'), (s) => {
        cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) })));
      });
    } catch {
      return noop;
    }
  },

  /**
   * Save a branch doc (owner or branch-staff editing their own). Runs the
   * Phase 3 schema guard and returns the branch id or throws a SchemaError.
   * Called from the admin only — customers don't write branches.
   */
  async saveBranch(b: Record<string, unknown>): Promise<string> {
    if (!db) throw new Error('no-db');
    const validated = validateBranch(b);
    await setDoc(doc(db, 'branches', validated.id), { ...validated, updatedAt: serverTimestamp() }, { merge: true });
    return validated.id;
  },

  /** Delete a branch. Owner-only per rules — throws on rule denial. */
  async deleteBranch(id: string): Promise<void> {
    if (!db) throw new Error('no-db');
    if (!id) throw new Error('missing-id');
    await deleteDoc(doc(db, 'branches', id));
  },

  async getBranches(): Promise<Branch[]> {
    if (!db) return [];
    try {
      const snap = await getDocs(collection(db, 'branches'));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) }));
    } catch {
      return [];
    }
  },

  /** Live customer-facing announcement banner. */
  onAnnouncementChange(cb: (a: { active: boolean; text: string; textAr: string; kind?: string } | null) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(doc(db, 'settings', 'announcement'), (s) => {
        cb(s.exists() ? (s.data() as any) : null);
      });
    } catch {
      return noop;
    }
  },

  async getAnnouncement() {
    if (!db) return null;
    try {
      const s = await getDoc(doc(db, 'settings', 'announcement'));
      return s.exists() ? s.data() : null;
    } catch {
      return null;
    }
  },

  // ── Phase 13 — tiers / streaks / missions ─────────────────────────────

  /**
   * Live tier config (settings/tierConfig). Falls back to the default ladder
   * baked in the customer app if the doc is missing so an offline first
   * visit still renders sensible tier UI.
   */
  onTierConfigChange(cb: (tiers: any[] | null) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(doc(db, 'settings', 'tierConfig'), (s) => {
        const d = s.exists() ? (s.data() as any) : null;
        cb(d && Array.isArray(d.tiers) ? d.tiers : null);
      });
    } catch { return noop; }
  },

  /** Live streak config. */
  onStreakConfigChange(cb: (cfg: any | null) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(doc(db, 'settings', 'streakConfig'), (s) => cb(s.exists() ? (s.data() as any) : null));
    } catch { return noop; }
  },

  /** Live list of active missions the customer can see (server filters active). */
  onActiveMissionsChange(cb: (missions: any[]) => void): Unsub {
    if (!db) return noop;
    try {
      const q1 = query(collection(db, 'missions'), where('active', '==', true));
      return onSnapshot(q1, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
    } catch { return noop; }
  },

  /** Live per-customer mission completion state (customerMissions/*). */
  onMyMissionStatesChange(uid: string, cb: (states: any[]) => void): Unsub {
    if (!db || !uid) return noop;
    try {
      const q1 = query(collection(db, 'customerMissions'), where('customerUid', '==', uid));
      return onSnapshot(q1, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
    } catch { return noop; }
  },

  /** Live customer doc — carries tier + streak snapshots the server writes. */
  onMyCustomerChange(uid: string, cb: (data: any | null) => void): Unsub {
    if (!db || !uid) return noop;
    try {
      return onSnapshot(doc(db, 'customers', uid), (s) => cb(s.exists() ? (s.data() as any) : null));
    } catch { return noop; }
  },

  /** Ask the server to recompute the caller's tier. Useful after a refund undo etc. */
  async recomputeMyTier(): Promise<any> {
    if (!fns) return null;
    try {
      const call = httpsCallable(fns, 'forceRecomputeTier');
      const res = await call({});
      return (res.data as any)?.tier || null;
    } catch { return null; }
  },

  // ── Phase 14 — referrals ──────────────────────────────────────────────

  /** Live referral config (settings/referralConfig). */
  onReferralConfigChange(cb: (cfg: any | null) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(doc(db, 'settings', 'referralConfig'), (s) => cb(s.exists() ? (s.data() as any) : null));
    } catch { return noop; }
  },

  /** Mint/return the signed-in customer's referral code. */
  async getMyReferralCode(): Promise<string | null> {
    if (!fns) return null;
    try {
      const call = httpsCallable(fns, 'getMyReferralCode');
      const res = await call({});
      const d = res.data as any;
      return d?.ok ? String(d.code || '') : null;
    } catch { return null; }
  },

  /**
   * Attach an inbound referral code to the caller. Returns the callable's
   * shaped response (`{ ok, error?, referralId?, referrerUid? }`) so the UI
   * can pick the right toast — "already attached", "self-referral", etc.
   */
  async attachReferralCode(code: string): Promise<{ ok: boolean; error?: string }> {
    if (!fns) return { ok: false, error: 'no-fns' };
    try {
      const call = httpsCallable(fns, 'attachReferralCode');
      const res = await call({ code });
      const d = res.data as any;
      return d && typeof d.ok === 'boolean' ? d : { ok: false, error: 'bad-response' };
    } catch (e: any) {
      return { ok: false, error: (e && e.code) || (e && e.message) || 'call-failed' };
    }
  },

  /** Live list of the caller's own referrals (for the "You referred N friends" card). */
  onMyReferralsChange(uid: string, cb: (rows: any[]) => void): Unsub {
    if (!db || !uid) return noop;
    try {
      const q1 = query(collection(db, 'referrals'), where('referrerUid', '==', uid));
      return onSnapshot(q1, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
    } catch { return noop; }
  },
};
