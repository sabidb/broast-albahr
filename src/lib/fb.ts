// Firebase integration, ported from the legacy app. All calls are guarded so
// the UI works offline / without Firestore access.
import { initializeApp, type FirebaseApp } from 'firebase/app';
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
  serverTimestamp,
  increment,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import type { Menu } from './data';

const firebaseConfig = {
  apiKey: 'AIzaSyB2PqybuRwuBjDQHgl1r9iFOC5b51r81-s',
  authDomain: 'broast-al-bahr.firebaseapp.com',
  projectId: 'broast-al-bahr',
  storageBucket: 'broast-al-bahr.firebasestorage.app',
  messagingSenderId: '663849043584',
  appId: '1:663849043584:web:b15e0a32eb9b6353830865',
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
} catch {
  db = null;
  storage = null;
}

type Unsub = () => void;
const noop: Unsub = () => {};

export const FB = {
  ready: () => !!db,

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

  async saveOrder(o: Record<string, unknown>) {
    if (!db) return;
    try {
      await addDoc(collection(db, 'orders'), { ...o, createdAt: serverTimestamp(), status: 'new' });
    } catch {}
  },

  async saveCustomer(d: { name: string; phone: string; loyaltyPoints?: number; firstSeen?: string }) {
    if (!db) return;
    try {
      const data: Record<string, unknown> = { ...d, lastSeen: serverTimestamp() };
      if (typeof d.loyaltyPoints === 'number') data.loyaltyPoints = increment(d.loyaltyPoints);
      await setDoc(doc(db, 'customers', d.phone), data, { merge: true });
    } catch {}
  },

  async getCustomerOrders(phone: string): Promise<Record<string, unknown>[]> {
    if (!db) return [];
    try {
      const snap = await getDocs(collection(db, 'orders'));
      return snap.docs
        .map((d) => ({ fbId: d.id, ...d.data() }))
        .filter((o: any) => o.userPhone === phone)
        .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } catch {
      return [];
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

  /** Live stream of orders (newest first) for the admin panel. */
  onOrdersChange(cb: (orders: any[]) => void): Unsub {
    if (!db) return noop;
    try {
      return onSnapshot(collection(db, 'orders'), (s) => {
        const o = s.docs.map((d) => ({ fbId: d.id, ...d.data() }));
        o.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        cb(o);
      });
    } catch {
      return noop;
    }
  },

  async updateOrderStatus(fbId: string, status: string) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'orders', fbId), { status, updatedAt: serverTimestamp() });
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
};
