import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { VALID_COUPONS, PAYMENT_METHODS, PICKUP_SLOTS, type Branch, type MenuItem } from '../lib/data';
import { computeTotals, money } from '../lib/utils';
import { FB } from '../lib/fb';
import ItemImage from './ItemImage';
import type { Cart } from './MenuStep';

// Hoisted so its component identity is stable across renders — an inline
// definition inside CheckoutStep caused every keystroke to remount its
// children, stealing focus from the note <textarea>.
function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-4">
      {children}
    </motion.div>
  );
}

interface Props {
  cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  user: { name: string; phone: string };
  onBack: () => void;
  onOrderPlaced: (o: any) => void;
  isAr: boolean;
  defaultBranchId?: string | null;
  branches: Branch[];
}

export default function CheckoutStep({ cart, setCart, user, onBack, onOrderPlaced, isAr, defaultBranchId, branches }: Props) {
  const items = Object.values(cart) as MenuItem[];

  // Live edits to the cart from within checkout. Qty 0 removes the row so
  // the customer doesn't have to bounce back to the menu just to drop a
  // line, and per-item notes ("no onions", "extra spicy") land on the
  // kitchen ticket without leaving the checkout flow.
  const bumpQty = (rawId: string | number, delta: number) => {
    const id = String(rawId);
    setCart((prev) => {
      const it = prev[id];
      if (!it) return prev;
      const next = { ...prev };
      const q = (it.qty || 0) + delta;
      if (q <= 0) { delete next[id]; return next; }
      next[id] = { ...it, qty: q };
      return next;
    });
  };
  const setItemNote = (rawId: string | number, note: string) => {
    const id = String(rawId);
    setCart((prev) => {
      const it = prev[id];
      if (!it) return prev;
      return { ...prev, [id]: { ...it, note } };
    });
  };
  const removeItem = (rawId: string | number) => {
    const id = String(rawId);
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const [branch, setBranch] = useState(defaultBranchId || '');
  const [pay, setPay] = useState('cash');
  const [note, setNote] = useState('');
  const [pickupTime, setPickupTime] = useState('ASAP');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<{ code: string; c: (typeof VALID_COUPONS)[string] } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  // Phase 11 — 12-char reward code / QR payload. Validated via callable,
  // reserved when the customer taps Confirm. The reserved code is passed
  // to submitOrder as rewardToken so the server can flip it RESERVED →
  // REDEEMED atomically with the order write.
  const [rewardInput, setRewardInput] = useState('');
  const [rewardChecking, setRewardChecking] = useState(false);
  const [rewardApplied, setRewardApplied] = useState<{ code: string; label: string } | null>(null);
  const [rewardMsg, setRewardMsg] = useState('');
  // Stable per-submission id so a retried tap doesn't create a duplicate order.
  const clientOrderIdRef = useRef<string>(
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36),
  );

  const subtotal = items.reduce((s, i) => s + i.price * (i.qty || 0), 0);
  const discount = applied
    ? applied.c.type === 'percent'
      ? Math.round((subtotal * applied.c.discount) / 100)
      : Math.min(applied.c.discount, subtotal)
    : 0;
  const totals = useMemo(() => computeTotals(items, discount), [cart, discount]);

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (VALID_COUPONS[code]) {
      setApplied({ code, c: VALID_COUPONS[code] });
      setCouponMsg(isAr ? `✅ تم تطبيق: ${VALID_COUPONS[code].label}` : `✅ Applied: ${VALID_COUPONS[code].label}`);
    } else {
      setApplied(null);
      setCouponMsg(isAr ? '❌ رمز غير صالح' : '❌ Invalid coupon');
    }
  };

  const REWARD_ERR: Record<string, { en: string; ar: string }> = {
    'not-found':       { en: 'Code not recognised.',           ar: 'الرمز غير معروف.' },
    'wrong-customer':  { en: 'This code belongs to another account.', ar: 'الرمز يخص حساب آخر.' },
    'not-available':   { en: 'This code was already used.',    ar: 'تم استخدام هذا الرمز.' },
    'expired':         { en: 'This code has expired.',         ar: 'انتهت صلاحية الرمز.' },
    'below-min-order': { en: 'Order total is below the minimum for this reward.', ar: 'المبلغ أقل من الحد الأدنى لهذه المكافأة.' },
    'wrong-branch':    { en: 'This code is for another branch.', ar: 'الرمز لفرع آخر.' },
    'wrong-product':   { en: 'This code needs a specific product in your cart.', ar: 'يتطلب الرمز منتجاً معيناً في السلة.' },
  };

  const applyReward = async () => {
    const raw = rewardInput.trim().toUpperCase();
    if (!raw) return;
    setRewardChecking(true);
    setRewardMsg('');
    try {
      const res = await FB.validateRewardCode({
        codeOrPayload: raw,
        branchId: branch,
        orderTotal: totals.total,
      });
      if (res && res.ok) {
        const label = (res.reward && (res.reward.label || res.reward.labelAr)) || (isAr ? 'مكافأة' : 'Reward');
        setRewardApplied({ code: res.code, label });
        setRewardMsg(isAr ? `✅ تم تطبيق: ${label}` : `✅ Applied: ${label}`);
      } else {
        setRewardApplied(null);
        const key = res && res.error ? String(res.error) : 'not-found';
        const msg = REWARD_ERR[key] || REWARD_ERR['not-found'];
        setRewardMsg(isAr ? `❌ ${msg.ar}` : `❌ ${msg.en}`);
      }
    } catch (err: any) {
      setRewardApplied(null);
      setRewardMsg(isAr ? '❌ تعذّر التحقق من الرمز' : '❌ Could not verify the code');
    } finally {
      setRewardChecking(false);
    }
  };

  const placeOrder = async () => {
    if (!branch) return alert(isAr ? 'اختر الفرع' : 'Please select a branch');
    // Reserve the reward token to this order before we submit. If the
    // reservation fails now, we don't send the token to the server — the
    // customer still gets to place the order and the token stays AVAILABLE
    // for a later attempt.
    let rewardToken = '';
    if (rewardApplied) {
      try {
        const res = await FB.reserveRewardCode({
          codeOrPayload: rewardApplied.code,
          orderId: clientOrderIdRef.current,
          branchId: branch,
          orderTotal: totals.total,
        });
        if (res && res.ok) {
          rewardToken = rewardApplied.code;
        } else {
          setRewardMsg(isAr ? '❌ تعذّر حجز الرمز — حاول مجدداً' : '❌ Could not reserve the code — try again');
          setRewardApplied(null);
          return;
        }
      } catch {
        // fall through; without a token the order still lands
      }
    }
    const branchObj = branches.find((b) => b.id === branch) || branches[0];
    const payload = {
      branch,
      branchObj,
      items,
      totals,
      pickupTime,
      paymentMethod: pay,
      note,
      couponCode: applied?.code || '',
      rewardToken,
      user,
      isAr,
      clientOrderId: clientOrderIdRef.current,
    };
    onOrderPlaced(payload);
  };

  const seg = (a: boolean) =>
    `flex-1 rounded-2xl border-2 py-3 text-[14px] font-black transition ${
      a ? 'border-brand-red bg-brand-red text-white shadow-red' : 'border-brand-line bg-white text-brand-ink2'
    }`;
  const label = 'mb-2.5 block text-xs font-extrabold uppercase tracking-wide text-brand-muted';

  return (
    <div className="min-h-screen">
      <div className="glass sticky top-0 z-[100] flex items-center gap-3 border-b border-brand-line px-5 py-4">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg text-brand-ink shadow-soft"
        >
          ←
        </motion.button>
        <div className="text-[18px] font-black text-brand-ink">{isAr ? 'إتمام الطلب 🛒' : 'Checkout 🛒'}</div>
      </div>

      <div className="mx-auto max-w-[600px] px-4 pb-28 pt-5">
        <Section>
          <span className={label}>{isAr ? 'نوع الطلب' : 'ORDER TYPE'}</span>
          <div className={seg(true)}>{isAr ? '🏃 استلام من الفرع' : '🏃 Pickup at Branch'}</div>
        </Section>

        <Section>
          <span className={label}>{isAr ? 'الفرع' : 'BRANCH'}</span>
          {branches.map((b) => {
            const on = branch === b.id;
            return (
              <motion.button
                key={b.id}
                whileTap={{ scale: 0.99 }}
                onClick={() => setBranch(b.id)}
                className="mb-2.5 w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-start transition"
                style={{
                  borderColor: on ? '#E10600' : 'rgba(30,18,6,0.10)',
                  boxShadow: on ? '0 10px 24px rgba(225,6,0,0.16)' : '0 2px 8px rgba(180,60,0,0.05)',
                }}
              >
                <div className="text-[14px] font-black" style={{ color: on ? '#E10600' : '#1E1206' }}>
                  {isAr ? b.nameAr : b.nameEn}
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-brand-muted">{isAr ? b.nameEn : b.nameAr}</div>
              </motion.button>
            );
          })}
        </Section>

        <Section>
          <span className={label}>⏰ {isAr ? 'وقت الاستلام' : 'PICKUP TIME'}</span>
          <div className="flex flex-wrap gap-2">
            {PICKUP_SLOTS.map((s) => {
              const on = pickupTime === s;
              return (
                <button
                  key={s}
                  onClick={() => setPickupTime(s)}
                  className="rounded-full border-2 px-4 py-2 text-xs font-black transition"
                  style={{
                    borderColor: on ? '#E10600' : 'rgba(30,18,6,0.10)',
                    background: on ? '#E10600' : '#FFFFFF',
                    color: on ? '#fff' : '#8C7A64',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Section>

        <Section>
          <span className={label}>{isAr ? 'طريقة الدفع' : 'PAYMENT'}</span>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map(([id, ic, en]) => {
              const on = pay === id;
              return (
                <button
                  key={id}
                  onClick={() => setPay(id)}
                  className="rounded-full border-2 px-4 py-2 text-xs font-black transition"
                  style={{
                    borderColor: on ? '#E10600' : 'rgba(30,18,6,0.10)',
                    background: on ? '#E10600' : '#FFFFFF',
                    color: on ? '#fff' : '#8C7A64',
                  }}
                >
                  {ic} {en}
                </button>
              );
            })}
          </div>
        </Section>

        <Section>
          <span className={label}>🎟️ {isAr ? 'رمز الكوبون' : 'COUPON'}</span>
          {applied ? (
            <div className="flex items-center justify-between rounded-2xl border-2 border-brand-green/30 bg-brand-green/8 px-4 py-3">
              <div>
                <div className="text-sm font-black text-brand-green">✅ {applied.code}</div>
                <div className="text-xs font-bold text-brand-green/80">
                  {isAr ? `خصم ${money(discount)}` : `Discount ${money(discount)}`}
                </div>
              </div>
              <button
                onClick={() => {
                  setApplied(null);
                  setCoupon('');
                  setCouponMsg('');
                }}
                className="rounded-xl bg-brand-red/10 px-3 py-1.5 text-xs font-black text-brand-red"
              >
                {isAr ? 'إزالة' : 'Remove'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value.toUpperCase());
                  setCouponMsg('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                placeholder={isAr ? 'أدخل الرمز' : 'Enter code'}
                className="flex-1 rounded-2xl border-2 border-brand-line bg-white px-4 py-3 text-[13px] font-bold text-brand-ink outline-none focus:border-brand-red"
              />
              <button onClick={applyCoupon} className="rounded-2xl bg-brand-red px-5 text-[13px] font-black text-white shadow-red">
                {isAr ? 'تطبيق' : 'Apply'}
              </button>
            </div>
          )}
          {couponMsg && !applied && <div className="mt-1.5 text-xs font-bold text-brand-red">{couponMsg}</div>}
          <div className="mt-2 text-[11px] font-bold text-brand-muted">
            {isAr ? 'جرّب: ALBAHR10 · WELCOME5 · BROAST15' : 'Try: ALBAHR10 · WELCOME5 · BROAST15'}
          </div>
        </Section>

        {/* Phase 11 — reward code / QR entry. Codes are 12-char server-issued
            tokens; the input accepts either the bare code or the full QR
            payload (code.mac). Validate button previews eligibility; the
            actual reservation happens when the customer taps Confirm. */}
        <Section>
          <span className={label}>🎁 {isAr ? 'رمز المكافأة' : 'REWARD CODE'}</span>
          {rewardApplied ? (
            <div className="flex items-center justify-between rounded-2xl border-2 border-brand-red/30 bg-brand-red/8 px-4 py-3">
              <div>
                <div className="mono text-sm font-black text-brand-red">✅ {rewardApplied.code}</div>
                <div className="text-xs font-bold text-brand-red/80">{rewardApplied.label}</div>
              </div>
              <button
                onClick={() => {
                  setRewardApplied(null);
                  setRewardInput('');
                  setRewardMsg('');
                }}
                className="rounded-xl bg-brand-red/10 px-3 py-1.5 text-xs font-black text-brand-red"
              >
                {isAr ? 'إزالة' : 'Remove'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={rewardInput}
                onChange={(e) => {
                  setRewardInput(e.target.value.toUpperCase());
                  setRewardMsg('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && !rewardChecking && applyReward()}
                placeholder={isAr ? '12 حرفاً' : '12-character code'}
                className="flex-1 rounded-2xl border-2 border-brand-line bg-white px-4 py-3 font-mono text-[13px] font-bold uppercase tracking-widest text-brand-ink outline-none focus:border-brand-red"
                maxLength={80}
              />
              <button
                onClick={applyReward}
                disabled={rewardChecking || rewardInput.trim().length < 12}
                className="rounded-2xl bg-brand-red px-5 text-[13px] font-black text-white shadow-red disabled:opacity-50"
              >
                {rewardChecking ? '…' : (isAr ? 'تطبيق' : 'Apply')}
              </button>
            </div>
          )}
          {rewardMsg && !rewardApplied && (
            <div className="mt-1.5 text-xs font-bold text-brand-red">{rewardMsg}</div>
          )}
        </Section>

        <Section>
          <span className={label}>{isAr ? 'ملاحظة' : 'NOTE'}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isAr ? 'أي طلب خاص...' : 'Special requests...'}
            className="h-20 w-full resize-none rounded-2xl border-2 border-brand-line bg-white px-4 py-3 text-[13px] font-bold text-brand-ink outline-none focus:border-brand-red"
          />
        </Section>

        <Section>
          <div className="card-surface p-5">
            <span className={label}>{isAr ? 'ملخص الطلب' : 'ORDER SUMMARY'}</span>
            {items.length === 0 && (
              <div className="py-4 text-center text-[13px] font-bold text-brand-muted">
                {isAr ? 'السلة فارغة' : 'Your cart is empty'}
              </div>
            )}
            {items.map((i) => (
              <div key={i.id} className="mb-3 border-b border-brand-line pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <span className="inline-block h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                    <ItemImage item={i} iconSize={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-black text-brand-ink">{isAr ? i.nameAr : i.name}</div>
                    <div className="mt-0.5 text-[11px] font-bold text-brand-muted">
                      {money(i.price)} {isAr ? 'للوحدة' : 'each'}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-black text-brand-red">{money(i.price * (i.qty || 0))}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-full border-2 border-brand-line bg-white">
                    <button
                      onClick={() => bumpQty(i.id, -1)}
                      aria-label="decrease"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-black text-brand-ink2 active:bg-brand-line"
                    >
                      −
                    </button>
                    <span className="min-w-[24px] text-center text-[13px] font-black text-brand-ink">{i.qty || 0}</span>
                    <button
                      onClick={() => bumpQty(i.id, +1)}
                      aria-label="increase"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-black text-brand-red active:bg-brand-red/10"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(i.id)}
                    className="rounded-xl bg-brand-red/10 px-3 py-1.5 text-[11px] font-black text-brand-red"
                  >
                    {isAr ? '🗑 إزالة' : '🗑 Remove'}
                  </button>
                </div>
                <textarea
                  value={i.note || ''}
                  onChange={(e) => setItemNote(i.id, e.target.value)}
                  placeholder={isAr ? 'ملاحظة على هذا الصنف (اختياري)' : 'Note for this item (optional)'}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-xl border-2 border-brand-line bg-white px-3 py-2 text-[12px] font-semibold text-brand-ink outline-none focus:border-brand-red"
                />
              </div>
            ))}
            <div className="mt-3 border-t border-brand-line pt-3">
              {[
                ...(totals.menuValue && totals.menuValue > totals.subtotal
                  ? [[isAr ? 'قيمة القائمة' : 'Menu value', money(totals.menuValue)]] : []),
                [isAr ? 'المجموع الفرعي' : 'Subtotal', money(totals.subtotal)],
                ...(totals.appDiscount && totals.appDiscount > 0
                  ? [[isAr ? 'خصم التطبيق' : 'App savings', '- ' + money(totals.appDiscount)]] : []),
                [isAr ? 'رسوم المنصة' : 'Platform Fee', money(totals.pFee)],
                ...(discount ? [[isAr ? 'الخصم' : 'Discount', '- ' + money(discount)]] : []),
              ].map(([l, v], i) => (
                <div key={i} className="mb-1.5 flex justify-between text-xs font-bold text-brand-muted">
                  <span>{l}</span>
                  <span>{v}</span>
                </div>
              ))}
              <div className="mb-1.5 text-[10px] font-semibold text-brand-muted/70">
                {isAr ? `الأسعار شاملة ضريبة القيمة المضافة 15% (${money(totals.vat)})` : `Prices include 15% VAT (${money(totals.vat)})`}
              </div>
              <div className="mt-2.5 flex justify-between border-t border-brand-line pt-3 text-xl font-black text-brand-ink">
                <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                <span className="text-brand-red">{money(totals.total)}</span>
              </div>
            </div>
          </div>
        </Section>

        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          onClick={placeOrder}
          className="sheen w-full rounded-2xl py-4 text-[17px] font-black text-white shadow-red"
          style={{ background: 'linear-gradient(135deg,#11845B,#0c6b49)' }}
        >
          {isAr ? '✅ تأكيد الطلب' : '✅ Confirm Order'}
        </motion.button>
      </div>
    </div>
  );
}
