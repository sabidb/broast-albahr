import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FB, type SavedAddress } from '../lib/fb';

interface Props {
  uid: string;
  isAr: boolean;
  onClose: () => void;
}

export default function AddressManager({ uid, isAr, onClose }: Props) {
  const [items, setItems] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('Home');
  const [line, setLine] = useState('');
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'ok'>('idle');
  const [locLink, setLocLink] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await FB.getCustomer(uid);
      if (cancelled) return;
      setItems(((c && (c.addresses as SavedAddress[])) || []).filter(Boolean));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const grabLocation = () => {
    if (!('geolocation' in navigator)) return;
    setLinkStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLink(`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`);
        setLinkStatus('ok');
      },
      () => setLinkStatus('idle'),
      { timeout: 6000 },
    );
  };

  const save = async () => {
    if (!line.trim()) return;
    const a: SavedAddress = {
      id: 'a' + Date.now(),
      label: label.trim() || (isAr ? 'عنوان' : 'Address'),
      line: line.trim(),
      locationLink: locLink,
    };
    setItems((prev) => [...prev, a]);
    await FB.addCustomerAddress(uid, a);
    setAdding(false);
    setLabel('Home');
    setLine('');
    setLocLink('');
    setLinkStatus('idle');
  };

  const remove = async (a: SavedAddress) => {
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    await FB.removeCustomerAddress(uid, a);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[350] flex items-end justify-center bg-brand-ink/50 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[28px] bg-brand-cream sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between border-b border-brand-line bg-white/85 px-5 py-4 backdrop-blur">
          <div className="text-[18px] font-black text-brand-ink">📍 {isAr ? 'عناويني' : 'My Addresses'}</div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-cream2 text-lg text-brand-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="mt-8 text-center text-sm font-bold text-brand-muted">{isAr ? 'جاري التحميل…' : 'Loading…'}</div>
          ) : (
            <div className="flex flex-col gap-2">
              <AnimatePresence>
                {items.map((a) => (
                  <motion.div
                    key={a.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-soft ring-1 ring-brand-line"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-cream2 text-lg">
                      🏠
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-black text-brand-ink">{a.label}</div>
                      <div className="mt-0.5 text-[12px] font-semibold leading-snug text-brand-ink2">{a.line}</div>
                      {a.locationLink && (
                        <a
                          href={a.locationLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-[11px] font-black text-brand-red"
                        >
                          📍 {isAr ? 'رابط الخرائط' : 'Map link'}
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => remove(a)}
                      className="text-lg text-brand-muted transition hover:text-brand-red"
                    >
                      🗑
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {items.length === 0 && (
                <div className="rounded-2xl bg-white p-5 text-center text-[13px] font-bold text-brand-muted ring-1 ring-brand-line">
                  {isAr ? 'لا توجد عناوين محفوظة بعد.' : 'No saved addresses yet.'}
                </div>
              )}

              {adding ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border-2 border-brand-red/40 bg-white p-3"
                >
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={isAr ? 'التسمية (البيت / العمل)' : 'Label (Home / Work)'}
                    className="w-full rounded-xl border-2 border-brand-line bg-brand-cream px-3 py-2 text-[13px] font-bold text-brand-ink outline-none placeholder:text-brand-muted focus:border-brand-red"
                  />
                  <textarea
                    value={line}
                    onChange={(e) => setLine(e.target.value)}
                    placeholder={isAr ? 'العنوان الكامل…' : 'Full address…'}
                    rows={2}
                    className="mt-2 w-full resize-none rounded-xl border-2 border-brand-line bg-brand-cream px-3 py-2 text-[13px] font-semibold text-brand-ink outline-none placeholder:text-brand-muted focus:border-brand-red"
                  />
                  <button
                    onClick={grabLocation}
                    className="mt-2 w-full rounded-xl border-2 border-dashed border-brand-line bg-brand-cream px-3 py-2 text-[12px] font-black text-brand-ink2"
                  >
                    {linkStatus === 'ok'
                      ? '✅ ' + (isAr ? 'تم إرفاق الموقع' : 'Location attached')
                      : linkStatus === 'loading'
                        ? isAr
                          ? 'جاري تحديد الموقع…'
                          : 'Locating…'
                        : '📍 ' + (isAr ? 'أرفق موقعي الحالي (اختياري)' : 'Attach my current location (optional)')}
                  </button>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => {
                        setAdding(false);
                        setLine('');
                        setLocLink('');
                      }}
                      className="flex-1 rounded-xl border-2 border-brand-line bg-white py-2 text-[12px] font-black text-brand-ink2"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      onClick={save}
                      disabled={!line.trim()}
                      className="flex-1 rounded-xl bg-brand-red py-2 text-[12px] font-black text-white shadow-red disabled:opacity-50"
                    >
                      {isAr ? 'حفظ العنوان' : 'Save address'}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="rounded-2xl border-2 border-dashed border-brand-red/40 bg-brand-red/5 py-3 text-[13px] font-black text-brand-red"
                >
                  + {isAr ? 'إضافة عنوان' : 'Add new address'}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
