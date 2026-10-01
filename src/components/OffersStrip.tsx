import { motion } from 'framer-motion';

export interface Offer {
  badge?: string;
  title?: string;
  titleAr?: string;
  sub?: string;
  subAr?: string;
  expiresAt?: string;
  active?: boolean;
}

interface Props {
  offers: Offer[];
  isAr: boolean;
}

// Customer-facing promo cards fed live from the admin "Offers" tab
// (settings/offers). Already filtered to active + non-expired in FB.onOffersChange.
export default function OffersStrip({ offers, isAr }: Props) {
  if (!offers || offers.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-3 text-[16px] font-black text-brand-ink">{isAr ? '🎁 العروض' : '🎁 Offers'}</div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {offers.map((o, i) => {
          const title = (isAr ? o.titleAr : o.title) || o.title || o.titleAr || '';
          const sub = (isAr ? o.subAr : o.sub) || o.sub || o.subAr || '';
          const ends = o.expiresAt ? new Date(o.expiresAt) : null;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="relative min-w-[78%] snap-start overflow-hidden rounded-3xl bg-gradient-to-br from-brand-red to-[#B00500] p-4 text-white shadow-red"
            >
              {o.badge && (
                <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">
                  {o.badge}
                </span>
              )}
              {title && <div className="mt-2 text-[18px] font-black leading-tight">{title}</div>}
              {sub && <div className="mt-1 text-[13px] font-bold text-white/90">{sub}</div>}
              {ends && !Number.isNaN(ends.getTime()) && (
                <div className="mt-2 text-[11px] font-bold text-white/70">
                  {isAr ? 'ينتهي ' : 'Ends '}
                  {ends.toLocaleDateString(isAr ? 'ar' : 'en', { day: 'numeric', month: 'short' })}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
