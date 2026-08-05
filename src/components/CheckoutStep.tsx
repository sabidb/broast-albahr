import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BRANCHES, VALID_COUPONS, PAYMENT_METHODS, PICKUP_SLOTS, type MenuItem } from '../lib/data';
import { calcDistance, getDeliveryFee, computeTotals, money } from '../lib/utils';
import ItemImage from './ItemImage';
import type { Cart } from './MenuStep';

interface Props {
  cart: Cart;
  user: { name: string; phone: string };
  onBack: () => void;
  onOrderPlaced: (o: any) => void;
  isAr: boolean;
}

type LocStatus = 'idle' | 'loading' | 'found' | 'unavailable' | 'error';

export default function CheckoutStep({ cart, user, onBack, onOrderPlaced, isAr }: Props) {
  const items = Object.values(cart) as MenuItem[];
  const [branch, setBranch] = useState('');
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [pay, setPay] = useState('cash');
  const [note, setNote] = useState('');
  const [pickupTime, setPickupTime] = useState('ASAP');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<{ code: string; c: (typeof VALID_COUPONS)[string] } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [locStatus, setLocStatus] = useState<LocStatus>('idle');
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const subtotal = items.reduce((s, i) => s + i.price * (i.qty || 0), 0);
  const discount = applied
    ? applied.c.type === 'percent'
      ? Math.round((subtotal * applied.c.discount) / 100)
      : Math.min(applied.c.discount, subtotal)
    : 0;
  const totals = useMemo(
    () => computeTotals(items, orderType, deliveryFee, discount),
    [cart, orderType, deliveryFee, discount],
  );

  const requestLoc = () => {
    if (!navigator.geolocation) return setLocStatus('error');
    setLocStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        const br = BRANCHES.find((b) => b.id === branch) || BRANCHES[0];
        const km = calcDistance(lat, lng, br.lat, br.lng);
        setDistance(Math.round(km * 10) / 10);
        const fee = getDeliveryFee(km);
        if (fee === -1) {
          setLocStatus('unavailable');
          setDeliveryFee(null);
        } else {
          setLocStatus('found');
          setDeliveryFee(fee);
        }
      },
      () => setLocStatus('error'),
    );
  };

  useEffect(() => {
    if (orderType === 'delivery' && branch) requestLoc();
    else {
      setLocStatus('idle');
      setDeliveryFee(null);
      setDistance(null);
      setCoords(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, branch]);

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

  const placeOrder = () => {
    if (!branch) return alert(isAr ? 'اختر الفرع' : 'Please select a branch');
    if (orderType === 'delivery' && locStatus !== 'found')
      return alert(isAr ? 'شارك موقعك أولاً' : 'Share your location first');
    const branchObj = BRANCHES.find((b) => b.id === branch) || BRANCHES[0];
    const locationLink = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : '';
    const payload = {
      branch,
      branchObj,
      orderType,
      items,
      totals,
      pickupTime: orderType === 'pickup' ? pickupTime : '',
      paymentMethod: pay,
      note,
      couponCode: applied?.code || '',
      locationLink,
      user,
      isAr,
    };
    onOrderPlaced(payload);
  };

  const seg = (a: boolean) =>
    `flex-1 rounded-2xl border-2 py-3 text-[14px] font-black transition ${
      a ? 'border-brand-red bg-brand-red text-white shadow-red' : 'border-brand-line bg-white text-brand-ink2'
    }`;
  const label = 'mb-2.5 block text-xs font-extrabold uppercase tracking-wide text-brand-muted';

  const Section = ({ children }: { children: React.ReactNode }) => (
    <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-4">
      {children}
    </motion.div>
  );

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
          <div className="flex gap-2.5">
            <button className={seg(orderType === 'pickup')} onClick={() => setOrderType('pickup')}>
              {isAr ? '🏃 استلام' : '🏃 Pickup'}
            </button>
            <button className={seg(orderType === 'delivery')} onClick={() => setOrderType('delivery')}>
              {isAr ? '🛵 توصيل' : '🛵 Delivery'}
            </button>
          </div>
        </Section>

        <Section>
          <span className={label}>{isAr ? 'الفرع' : 'BRANCH'}</span>
          {BRANCHES.map((b) => {
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

        {orderType === 'pickup' && (
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
        )}

        {orderType === 'delivery' && (
          <Section>
            <div className="card-surface p-4">
              <span className={label}>📍 {isAr ? 'الموقع' : 'LOCATION'}</span>
              {locStatus === 'idle' && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={requestLoc}
                  className="sheen w-full rounded-2xl bg-brand-red py-3.5 text-sm font-black text-white shadow-red"
                >
                  {isAr ? '📍 مشاركة موقعي' : '📍 Share My Location'}
                </motion.button>
              )}
              {locStatus === 'loading' && (
                <div className="py-3 text-center font-bold text-brand-muted">
                  {isAr ? 'جاري تحديد الموقع...' : 'Getting your location...'}
                </div>
              )}
              {locStatus === 'found' && (
                <div>
                  <div className="mb-1.5 font-black text-brand-green">✅ {distance} km {isAr ? 'بعيد' : 'away'}</div>
                  <div className="text-lg font-black text-brand-red">
                    {isAr ? 'التوصيل' : 'Delivery'}: {money(deliveryFee || 0)}
                  </div>
                  {coords && (
                    <a
                      href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-xs font-bold text-brand-red underline"
                    >
                      🗺️ {isAr ? 'عرض على الخريطة' : 'View on map'}
                    </a>
                  )}
                </div>
              )}
              {locStatus === 'unavailable' && (
                <div className="font-black text-brand-red">
                  ⚠️ {isAr ? 'خارج نطاق التوصيل (7 كم كحد أقصى)' : 'Outside delivery range (max 7km)'}
                </div>
              )}
              {locStatus === 'error' && (
                <div>
                  <div className="mb-2 text-xs font-bold text-brand-red">
                    {isAr ? 'تعذر تحديد الموقع' : 'Could not get location'}
                  </div>
                  <button onClick={requestLoc} className="rounded-xl border-2 border-brand-red px-4 py-2 text-xs font-black text-brand-red">
                    {isAr ? 'حاول مجدداً' : 'Try again'}
                  </button>
                </div>
              )}
            </div>
          </Section>
        )}

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
            {items.map((i) => (
              <div key={i.id} className="mb-2 flex items-center justify-between text-[13px] font-bold">
                <span className="flex items-center gap-1.5 text-brand-ink2">
                  <span className="inline-block h-6 w-6 shrink-0 overflow-hidden rounded-md">
                    <ItemImage item={i} iconSize={14} />
                  </span>
                  {isAr ? i.nameAr : i.name} ×{i.qty}
                </span>
                <span className="font-black text-brand-red">{money(i.price * (i.qty || 0))}</span>
              </div>
            ))}
            <div className="mt-3 border-t border-brand-line pt-3">
              {[
                [isAr ? 'المجموع الفرعي' : 'Subtotal', money(totals.subtotal)],
                [isAr ? 'رسوم المنصة' : 'Platform Fee', money(totals.pFee)],
                ...(orderType === 'delivery' && totals.dFee ? [[isAr ? 'التوصيل' : 'Delivery', money(totals.dFee)]] : []),
                ...(discount ? [[isAr ? 'الخصم' : 'Discount', '- ' + money(discount)]] : []),
                [isAr ? 'ضريبة 15%' : 'VAT 15%', money(totals.vat)],
              ].map(([l, v], i) => (
                <div key={i} className="mb-1.5 flex justify-between text-xs font-bold text-brand-muted">
                  <span>{l}</span>
                  <span>{v}</span>
                </div>
              ))}
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
