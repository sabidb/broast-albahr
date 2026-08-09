// Phase 3 — canonical Firestore document shapes.
//
// Every writer in the app must pass its payload through the guard for its
// collection before hitting Firestore. A guard returns either a normalized
// object (safe to write) or throws a SchemaError with the offending field
// path — callers can catch and surface a clear message to the user without
// letting a malformed doc land in the database.
//
// The guards are intentionally hand-rolled (no zod / valibot dependency) so
// the customer-app bundle stays small and the same shape logic can be mirrored
// inline in the admin index.html.
//
// See docs/schema.md for the human-readable reference.

export class SchemaError extends Error {
  path: string;
  constructor(path: string, message: string) {
    super(`[schema] ${path}: ${message}`);
    this.path = path;
    this.name = 'SchemaError';
  }
}

// ── primitives ─────────────────────────────────────────────────────────
const SA_PHONE = /^05\d{8}$/;
const ORDER_NO = /^\d{6}$/;

function str(v: unknown, path: string, opts: { min?: number; max?: number; match?: RegExp } = {}): string {
  if (typeof v !== 'string') throw new SchemaError(path, `expected string, got ${typeof v}`);
  const s = v.trim();
  if (opts.min != null && s.length < opts.min) throw new SchemaError(path, `min length ${opts.min}`);
  if (opts.max != null && s.length > opts.max) throw new SchemaError(path, `max length ${opts.max}`);
  if (opts.match && !opts.match.test(s)) throw new SchemaError(path, `does not match ${opts.match}`);
  return s;
}
function optStr(v: unknown, path: string, opts?: Parameters<typeof str>[2]): string | undefined {
  if (v == null || v === '') return undefined;
  return str(v, path, opts);
}
function num(v: unknown, path: string, opts: { min?: number; max?: number; int?: boolean } = {}): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new SchemaError(path, `expected number`);
  if (opts.int && !Number.isInteger(n)) throw new SchemaError(path, `expected integer`);
  if (opts.min != null && n < opts.min) throw new SchemaError(path, `min ${opts.min}`);
  if (opts.max != null && n > opts.max) throw new SchemaError(path, `max ${opts.max}`);
  return n;
}
function optNum(v: unknown, path: string, opts?: Parameters<typeof num>[2]): number | undefined {
  if (v == null || v === '') return undefined;
  return num(v, path, opts);
}
function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new SchemaError(path, `expected boolean`);
  return v;
}
function optBool(v: unknown, path: string): boolean | undefined {
  if (v == null) return undefined;
  return bool(v, path);
}
function optIn<T extends string>(v: unknown, path: string, allowed: readonly T[]): T | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new SchemaError(path, `expected one of ${allowed.join('|')}`);
  }
  return v as T;
}

// ── customers ──────────────────────────────────────────────────────────
export interface CustomerDoc {
  uid: string;
  name: string;
  phone: string;
  firstSeen?: string;
  lastSeen?: unknown; // serverTimestamp sentinel — checked by presence, not shape
  loyaltyPoints?: number | unknown; // may be an `increment(...)` sentinel
  lastAddress?: string;
  addresses?: Array<{ id: string; label: string; line: string; locationLink?: string }>;
}
export function validateCustomer(input: Record<string, unknown>): CustomerDoc {
  const out: CustomerDoc = {
    uid: str(input.uid, 'customer.uid', { min: 1, max: 128 }),
    name: str(input.name, 'customer.name', { min: 1, max: 60 }),
    phone: str(input.phone, 'customer.phone', { match: SA_PHONE }),
  };
  const firstSeen = optStr(input.firstSeen, 'customer.firstSeen');
  if (firstSeen) out.firstSeen = firstSeen;
  if (input.lastSeen !== undefined) out.lastSeen = input.lastSeen;
  if (input.loyaltyPoints !== undefined) out.loyaltyPoints = input.loyaltyPoints;
  const lastAddress = optStr(input.lastAddress, 'customer.lastAddress', { max: 500 });
  if (lastAddress) out.lastAddress = lastAddress;
  if (Array.isArray(input.addresses)) {
    out.addresses = input.addresses.map((a: any, i) => ({
      id: str(a?.id, `customer.addresses[${i}].id`, { min: 1, max: 80 }),
      label: str(a?.label, `customer.addresses[${i}].label`, { min: 1, max: 40 }),
      line: str(a?.line, `customer.addresses[${i}].line`, { min: 1, max: 500 }),
      locationLink: optStr(a?.locationLink, `customer.addresses[${i}].locationLink`, { max: 500 }),
    }));
  }
  return out;
}

// ── orders ─────────────────────────────────────────────────────────────
export const ORDER_STATUSES = [
  'new', 'pending', 'accepted', 'preparing', 'cooking',
  'almost_ready', 'ready', 'done', 'completed', 'cancelled', 'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_METHODS_ALLOWED = ['cash', 'card', 'prepaid'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS_ALLOWED)[number];
export const ORDER_TYPES_ALLOWED = ['pickup', 'delivery'] as const;

export interface OrderItem {
  id: string | number;
  name: string;
  nameAr?: string;
  price: number;
  qty: number;
  note?: string;
  emoji?: string;
}
export interface OrderTotals {
  subtotal: number;
  pFee: number;
  vat: number;
  discount?: number;
  total: number;
}
export interface OrderDoc {
  orderNo: string;
  userUid: string;
  userName: string;
  userPhone: string;
  branch: string;
  branchObj?: Record<string, unknown>;
  items: OrderItem[];
  totals: OrderTotals;
  total: number;
  pickupTime?: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  note?: string;
  status: OrderStatus;
  statusHistory?: Array<{ status: string; at: string }>;
  clientOrderId?: string;
  createdAt?: unknown; // serverTimestamp
  orderType?: (typeof ORDER_TYPES_ALLOWED)[number];
  date?: string;
  [k: string]: unknown; // room for admin-owned fields (driver*, address, etc.)
}
export function validateOrder(input: Record<string, unknown>): OrderDoc {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) throw new SchemaError('order.items', 'must not be empty');
  const totalsRaw = (input.totals as any) || {};
  const totals: OrderTotals = {
    subtotal: num(totalsRaw.subtotal, 'order.totals.subtotal', { min: 0 }),
    pFee: num(totalsRaw.pFee, 'order.totals.pFee', { min: 0 }),
    vat: num(totalsRaw.vat, 'order.totals.vat', { min: 0 }),
    total: num(totalsRaw.total, 'order.totals.total', { min: 0 }),
  };
  const totalsDiscount = optNum(totalsRaw.discount, 'order.totals.discount', { min: 0 });
  if (totalsDiscount != null) totals.discount = totalsDiscount;

  const out: OrderDoc = {
    orderNo: str(input.orderNo, 'order.orderNo', { match: ORDER_NO }),
    userUid: str(input.userUid, 'order.userUid', { min: 1, max: 128 }),
    userName: str(input.userName, 'order.userName', { min: 1, max: 60 }),
    userPhone: str(input.userPhone, 'order.userPhone', { match: SA_PHONE }),
    branch: str(input.branch, 'order.branch', { min: 1, max: 40 }),
    items: items.map((it: any, i) => {
      const id = typeof it?.id === 'number' ? it.id : str(it?.id, `order.items[${i}].id`, { min: 1, max: 60 });
      return {
        id,
        name: str(it?.name, `order.items[${i}].name`, { min: 1, max: 120 }),
        nameAr: optStr(it?.nameAr, `order.items[${i}].nameAr`, { max: 120 }),
        price: num(it?.price, `order.items[${i}].price`, { min: 0 }),
        qty: num(it?.qty, `order.items[${i}].qty`, { min: 1, max: 999, int: true }),
        note: optStr(it?.note, `order.items[${i}].note`, { max: 500 }),
        emoji: optStr(it?.emoji, `order.items[${i}].emoji`, { max: 8 }),
      };
    }),
    totals,
    total: num(input.total ?? totals.total, 'order.total', { min: 0 }),
    paymentMethod: (optIn(input.paymentMethod, 'order.paymentMethod', PAYMENT_METHODS_ALLOWED) || 'cash') as PaymentMethod,
    status: (optIn(input.status, 'order.status', ORDER_STATUSES) || 'new') as OrderStatus,
  };
  if (input.branchObj && typeof input.branchObj === 'object') out.branchObj = input.branchObj as Record<string, unknown>;
  const pickupTime = optStr(input.pickupTime, 'order.pickupTime', { max: 40 });
  if (pickupTime) out.pickupTime = pickupTime;
  const couponCode = optStr(input.couponCode, 'order.couponCode', { max: 32 });
  if (couponCode) out.couponCode = couponCode;
  const note = optStr(input.note, 'order.note', { max: 500 });
  if (note) out.note = note;
  const clientOrderId = optStr(input.clientOrderId, 'order.clientOrderId', { max: 80 });
  if (clientOrderId) out.clientOrderId = clientOrderId;
  const orderType = optIn(input.orderType, 'order.orderType', ORDER_TYPES_ALLOWED);
  if (orderType) out.orderType = orderType;
  const dateStr = optStr(input.date, 'order.date', { max: 40 });
  if (dateStr) out.date = dateStr;
  if (Array.isArray(input.statusHistory)) {
    out.statusHistory = input.statusHistory.map((h: any, i) => ({
      status: str(h?.status, `order.statusHistory[${i}].status`, { min: 1, max: 30 }),
      at: str(h?.at, `order.statusHistory[${i}].at`, { min: 1, max: 40 }),
    }));
  }
  if (input.createdAt !== undefined) out.createdAt = input.createdAt;
  // Passthrough for admin-only fields (driverName, driverPhone, locationLink,
  // address, overrides, rating) — trusted paths write these post-create.
  ['driverName', 'driverPhone', 'locationLink', 'address', 'overrides', 'rating', 'userName']
    .forEach((k) => { if (input[k] !== undefined && out[k] === undefined) out[k] = input[k]; });
  return out;
}

// ── branches ───────────────────────────────────────────────────────────
export interface BranchDoc {
  id: string;
  nameEn: string;
  nameAr: string;
  active?: boolean;
  phone?: string;
  whatsapp?: string;
  address?: string;
  lat?: number;
  lng?: number;
  hours?: { open?: string; close?: string };
  menuOverrides?: string[];
  prepMinutesPickup?: number;
  prepMinutesDelivery?: number;
}
export function validateBranch(input: Record<string, unknown>): BranchDoc {
  const out: BranchDoc = {
    id: str(input.id, 'branch.id', { min: 1, max: 40 }),
    nameEn: str(input.nameEn, 'branch.nameEn', { min: 1, max: 80 }),
    nameAr: str(input.nameAr, 'branch.nameAr', { min: 1, max: 80 }),
  };
  const active = optBool(input.active, 'branch.active');
  if (active != null) out.active = active;
  const phone = optStr(input.phone, 'branch.phone', { max: 20 });
  if (phone) out.phone = phone;
  const whatsapp = optStr(input.whatsapp, 'branch.whatsapp', { max: 20 });
  if (whatsapp) out.whatsapp = whatsapp;
  const address = optStr(input.address, 'branch.address', { max: 500 });
  if (address) out.address = address;
  const lat = optNum(input.lat, 'branch.lat', { min: -90, max: 90 });
  if (lat != null) out.lat = lat;
  const lng = optNum(input.lng, 'branch.lng', { min: -180, max: 180 });
  if (lng != null) out.lng = lng;
  if (input.hours && typeof input.hours === 'object') {
    const h = input.hours as any;
    const open = optStr(h.open, 'branch.hours.open', { max: 8 });
    const close = optStr(h.close, 'branch.hours.close', { max: 8 });
    if (open || close) out.hours = { ...(open ? { open } : {}), ...(close ? { close } : {}) };
  }
  if (Array.isArray(input.menuOverrides)) {
    out.menuOverrides = input.menuOverrides.map((s: any, i) => str(s, `branch.menuOverrides[${i}]`, { min: 1, max: 60 }));
  }
  const prepP = optNum(input.prepMinutesPickup, 'branch.prepMinutesPickup', { min: 1, max: 240, int: true });
  if (prepP != null) out.prepMinutesPickup = prepP;
  const prepD = optNum(input.prepMinutesDelivery, 'branch.prepMinutesDelivery', { min: 1, max: 240, int: true });
  if (prepD != null) out.prepMinutesDelivery = prepD;
  return out;
}

// ── notifications ──────────────────────────────────────────────────────
export interface NotificationDoc {
  title: string;
  body: string;
  titleAr?: string;
  bodyAr?: string;
  kind?: string;
  orderNo?: string;
  read?: boolean;
  createdAt?: unknown;
}
export function validateNotification(input: Record<string, unknown>): NotificationDoc {
  const out: NotificationDoc = {
    title: str(input.title, 'notification.title', { min: 1, max: 120 }),
    body: str(input.body, 'notification.body', { min: 1, max: 1000 }),
  };
  const titleAr = optStr(input.titleAr, 'notification.titleAr', { max: 120 });
  if (titleAr) out.titleAr = titleAr;
  const bodyAr = optStr(input.bodyAr, 'notification.bodyAr', { max: 1000 });
  if (bodyAr) out.bodyAr = bodyAr;
  const kind = optStr(input.kind, 'notification.kind', { max: 30 });
  if (kind) out.kind = kind;
  const orderNo = optStr(input.orderNo, 'notification.orderNo', { max: 20 });
  if (orderNo) out.orderNo = orderNo;
  const read = optBool(input.read, 'notification.read');
  if (read != null) out.read = read;
  if (input.createdAt !== undefined) out.createdAt = input.createdAt;
  return out;
}
