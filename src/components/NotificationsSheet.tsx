import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FB } from '../lib/fb';

interface Item {
  fbId: string;
  title?: string;
  titleAr?: string;
  body?: string;
  bodyAr?: string;
  kind?: string;
  orderNo?: string;
  read?: boolean;
  createdAt?: { seconds: number };
}

function iconFor(kind?: string) {
  const k = (kind || '').toLowerCase();
  if (k === 'accepted') return '👍';
  if (k === 'preparing') return '👨‍🍳';
  if (k === 'ready') return '🍽️';
  if (k === 'completed' || k === 'done') return '✅';
  if (k === 'cancelled') return '❌';
  if (k === 'refunded') return '💸';
  if (k === 'offer' || k === 'promo') return '🎁';
  return '🔔';
}

function timeAgo(sec: number | undefined, isAr: boolean) {
  if (!sec) return '';
  const d = Date.now() / 1000 - sec;
  if (d < 60) return isAr ? 'الآن' : 'now';
  if (d < 3600) return `${Math.round(d / 60)}${isAr ? ' د' : 'm'}`;
  if (d < 86400) return `${Math.round(d / 3600)}${isAr ? ' س' : 'h'}`;
  return `${Math.round(d / 86400)}${isAr ? ' يوم' : 'd'}`;
}

export function NotificationsSheet({
  phone,
  isAr,
  onClose,
}: {
  phone: string;
  isAr: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const unsub = FB.subscribeNotifications(phone, (rows) => setItems(rows as Item[]));
    return () => unsub();
  }, [phone]);

  useEffect(() => {
    FB.markAllNotificationsRead(phone);
  }, [phone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[300] flex items-end justify-center bg-brand-ink/50 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[28px] bg-brand-cream sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between border-b border-brand-line bg-white/85 px-5 py-4 backdrop-blur">
          <div className="text-[18px] font-black text-brand-ink">
            🔔 {isAr ? 'الإشعارات' : 'Notifications'}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-cream2 text-lg text-brand-ink"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="mt-16 text-center">
              <div className="text-6xl">🔕</div>
              <div className="mt-2 font-black text-brand-ink">
                {isAr ? 'لا توجد إشعارات بعد' : 'No notifications yet'}
              </div>
              <p className="mt-1 text-[13px] font-semibold text-brand-muted">
                {isAr ? 'سنبلغك عند تغيّر حالة طلبك.' : "We'll ping you when your order status changes."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.map((n) => (
                  <motion.div
                    key={n.fbId}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-soft ring-1 ring-brand-line"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-cream2 text-lg">
                      {iconFor(n.kind)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="truncate text-[14px] font-black text-brand-ink">
                          {(isAr && n.titleAr) || n.title || (isAr ? 'إشعار' : 'Notification')}
                        </div>
                        <div className="shrink-0 text-[10px] font-black uppercase text-brand-muted">
                          {timeAgo(n.createdAt?.seconds, isAr)}
                        </div>
                      </div>
                      <div className="mt-0.5 text-[12px] font-semibold leading-snug text-brand-ink2">
                        {(isAr && n.bodyAr) || n.body || ''}
                      </div>
                      {n.orderNo && (
                        <div className="mt-1 inline-block rounded-full bg-brand-red/10 px-2 py-0.5 text-[10px] font-black text-brand-red">
                          #{n.orderNo}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Bell button for the header, shows an unread badge. */
export function NotificationsBell({
  phone,
  isAr,
  onOpen,
}: {
  phone: string;
  isAr: boolean;
  onOpen: () => void;
}) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const unsub = FB.subscribeNotifications(phone, (rows) => {
      setUnread(rows.filter((r: any) => !r.read).length);
    });
    return () => unsub();
  }, [phone]);

  return (
    <button
      onClick={onOpen}
      aria-label={isAr ? 'الإشعارات' : 'Notifications'}
      className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg shadow-soft"
    >
      🔔
      {unread > 0 && (
        <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-black text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
