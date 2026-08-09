// Firebase integration. All Firestore calls are guarded so the UI works
// offline / without Firestore access. Phase 2 also handles Firebase Auth (phone)
// and App Check (reCAPTCHA v3).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut as fbSignOut,
  RecaptchaVerifier,
  type Auth,
  type ConfirmationResult,
  type User as FbUser,
} from 'firebase/auth';
import {
  getFirestore,
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
  db = getFirestore(app);
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

/** Normalise a Saudi phone (`05XXXXXXXX` or `+9665XXXXXXXX`) to E.164 for Firebase Auth. */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('966')) return '+' + digits;
  if (digits.startsWith('05')) return '+966' + digits.slice(1);
  if (digits.startsWith('5') && digits.length === 9) return '+966' + digits;
  return phone.startsWith('+') ? phone : '+' + digits;
}

/** Convert an E.164 Saudi phone back to the legacy `05...` id used as Firestore doc key. */
export function fromE164(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('966')) return '0' + digits.slice(3);
  return e164;
}

export interface AuthUser {
  uid: string;
  phone: string; // legacy local format (`05...`) — used as customers/{phone} key
  e164: string; // canonical E.164 — matches request.auth.token.phone_number
}

function shape(u: FbUser | null): AuthUser | null {
  if (!u || !u.phoneNumber) return null;
  return { uid: u.uid, phone: fromE164(u.phoneNumber), e164: u.phoneNumber };
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
   * Kick off phone-number sign-in. Returns a `ConfirmationResult` — call
   * `.confirm(code)` with the SMS code, which returns a `UserCredential`.
   * `containerId` must reference a div in the DOM for the invisible reCAPTCHA.
   */
  async startPhoneSignIn(phone: string, containerId: string): Promise<ConfirmationResult> {
    if (!auth) throw new Error('auth-unavailable');
    // The verifier can only be constructed once per DOM node; recycle it on retry.
    const w = window as unknown as { __baVerifier?: RecaptchaVerifier };
    if (w.__baVerifier) {
      try { w.__baVerifier.clear(); } catch {}
      w.__baVerifier = undefined;
    }
    const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
    w.__baVerifier = verifier;
    return signInWithPhoneNumber(auth, toE164(phone), verifier);
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
  async saveOrder(o: Record<string, unknown>): Promise<{ fbId: string | null; orderNo: string }> {
    const orderNo = (o.orderNo as string) || (await FB.nextOrderNo());
    if (!db) return { fbId: null, orderNo };
    const clientOrderId = o.clientOrderId as string | undefined;
    try {
      if (clientOrderId) {
        const existing = await getDocs(query(collection(db, 'orders'), where('clientOrderId', '==', clientOrderId), limit(1)));
        if (!existing.empty) {
          const d = existing.docs[0];
          return { fbId: d.id, orderNo: (d.data().orderNo as string) || orderNo };
        }
      }
      const ref = await addDoc(collection(db, 'orders'), {
        ...o,
        orderNo,
        createdAt: serverTimestamp(),
        status: 'new',
        statusHistory: [{ status: 'new', at: new Date().toISOString() }],
      });
      return { fbId: ref.id, orderNo };
    } catch {
      return { fbId: null, orderNo };
    }
  },

  async saveCustomer(d: {
    name: string;
    phone: string;
    loyaltyPoints?: number;
    firstSeen?: string;
    lastAddress?: string;
  }) {
    if (!db) return;
    try {
      const data: Record<string, unknown> = { ...d, lastSeen: serverTimestamp() };
      if (typeof d.loyaltyPoints === 'number') data.loyaltyPoints = increment(d.loyaltyPoints);
      await setDoc(doc(db, 'customers', d.phone), data, { merge: true });
    } catch {}
  },

  async getCustomer(phone: string): Promise<Record<string, unknown> | null> {
    if (!db) return null;
    try {
      const s = await getDoc(doc(db, 'customers', phone));
      return s.exists() ? (s.data() as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  },

  async addCustomerAddress(phone: string, a: SavedAddress) {
    if (!db) return;
    try {
      await setDoc(doc(db, 'customers', phone), { addresses: arrayUnion(a) }, { merge: true });
    } catch {}
  },

  async removeCustomerAddress(phone: string, a: SavedAddress) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'customers', phone), { addresses: arrayRemove(a) });
    } catch {}
  },

  async getCustomerOrders(phone: string): Promise<Record<string, unknown>[]> {
    if (!db) return [];
    try {
      const q1 = query(collection(db, 'orders'), where('userPhone', '==', phone));
      const snap = await getDocs(q1);
      return snap.docs
        .map((d) => ({ fbId: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } catch {
      // fallback: scan (older security rules)
      try {
        const snap = await getDocs(collection(db, 'orders'));
        return snap.docs
          .map((d) => ({ fbId: d.id, ...d.data() }))
          .filter((o: any) => o.userPhone === phone)
          .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      } catch {
        return [];
      }
    }
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
