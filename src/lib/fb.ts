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
import type { Branch, Menu } from './data';
import { validateOrder, validateCustomer, validateBranch, SchemaError } from './schema';
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
   * Save a new order. Returns { fbId, orderNo }. Idempotent on `clientOrderId`:
   * a retry with the same key returns the original doc instead of double-writing.
   */
  async saveOrder(o: Record<string, unknown>): Promise<{ fbId: string | null; orderNo: string; error?: string }> {
    // Single source of truth for the order number: mint it here, using the
    // caller's branch so the per-branch counter (orderNo-<branchId>) ticks
    // instead of the global one. Pre-generating in the UI and passing it
    // through was the shape that let a re-entrant click consume two counter
    // values and race two setDoc writes against the same clientOrderId —
    // whichever finished last won in Firestore, so the app could show 100011
    // while the persisted doc kept 100010.
    const orderNo = (o.orderNo as string) || (await FB.nextOrderNo(o.branch as string | undefined));
    if (!db) return { fbId: null, orderNo, error: 'no-db' };
    const clientOrderId = o.clientOrderId as string | undefined;
    // Validate BEFORE stamping createdAt so a rejected payload never mints
    // a phantom orderNo write. Throws SchemaError with a clear field path.
    let validated: Record<string, unknown>;
    try {
      validated = validateOrder({ ...o, orderNo, status: 'new' }) as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof SchemaError ? err.message : String(err);
      try { console.error('[FB.saveOrder] rejected by schema:', msg); } catch {}
      return { fbId: null, orderNo, error: msg };
    }
    const payload = {
      ...validated,
      createdAt: serverTimestamp(),
      statusHistory: [{ status: 'new', at: new Date().toISOString() }],
    };
    try {
      // setDoc against a fixed client-chosen id is inherently idempotent — a
      // retry writes to the same path with the same payload. No preflight
      // getDoc (a getDoc on a nonexistent doc can trip strict read rules
      // that inspect resource.data, and we don't need one anyway).
      if (clientOrderId) {
        const ref = doc(db, 'orders', clientOrderId);
        await setDoc(ref, payload);
        return { fbId: ref.id, orderNo };
      }
      const ref = await addDoc(collection(db, 'orders'), payload);
      return { fbId: ref.id, orderNo };
    } catch (err: any) {
      // Bubble Firestore's real error code (e.g. "permission-denied") back to
      // the caller so the UI can surface it as a toast — silent failures
      // are what let today's regression sit unnoticed.
      const code = err?.code || err?.name || 'unknown';
      const msg = err?.message || String(err);
      try { console.error('[FB.saveOrder] write failed:', code, msg, err); } catch {}
      return { fbId: null, orderNo, error: `${code}: ${msg}` };
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
        const n = Number((d.data() as any)?.loyaltyPoints) || 0;
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

  async updateOrderStatus(fbId: string, status: string) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'orders', fbId), {
        status,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({ status, at: new Date().toISOString() }),
      });
    } catch {}
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
};
