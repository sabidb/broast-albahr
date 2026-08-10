/**
 * Notification templates + dispatch — Phase 9.
 *
 * Every customer-facing message key lives here (bilingual). The dispatcher
 * writes to the in-app inbox (notifications/{phone}/items), stamps a
 * notifications_log entry for observability, and pushes to FCM when a token
 * is registered on the customer profile. All writes go through the Admin SDK
 * so rules stay locked down.
 *
 * Dedup: every dispatch takes a stable `dedupKey`. A duplicate write (retry,
 * webhook replay) is a no-op — the log entry says "duplicate" and no second
 * inbox item / push lands.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export interface Template {
  title: string;
  body: string;
  titleAr: string;
  bodyAr: string;
  /** Optional kind for the client to filter/route (e.g. "order", "reward"). */
  kind?: string;
}

export type TemplateName =
  | 'order.accepted' | 'order.preparing' | 'order.cooking' | 'order.almost_ready'
  | 'order.ready' | 'order.completed' | 'order.cancelled' | 'order.refunded'
  | 'reward.issued' | 'reward.expiring' | 'reward.redeemed'
  | 'points.earned' | 'points.redeemed'
  | 'streak.milestone' | 'campaign.available'
  // Phase 13 additions.
  | 'tier.upgraded' | 'mission.available' | 'mission.completed';

const T = (title: string, body: string, titleAr: string, bodyAr: string, kind = 'order'): Template =>
  ({ title, body, titleAr, bodyAr, kind });

export const TEMPLATES: Record<TemplateName, (ctx: Record<string, string>) => Template> = {
  'order.accepted':     (c) => T('Order accepted',          `We got your order #${c.orderNo} — starting shortly.`,        'تم قبول الطلب',           `استلمنا طلبك #${c.orderNo} — سنبدأ التحضير قريباً.`),
  'order.preparing':    (c) => T('Your order is preparing', `Order #${c.orderNo} is being prepared. Ready in ~15 min.`,   'طلبك قيد التحضير',        `طلبك #${c.orderNo} قيد التحضير الآن. سيكون جاهزاً خلال ~15 دقيقة.`),
  'order.cooking':      (c) => T('Cooking your order',      `Order #${c.orderNo} is cooking now! ~10 min remaining.`,     'يتم طبخ طلبك',            `طلبك #${c.orderNo} يُطبخ الآن! متبقي ~10 دقائق.`),
  'order.almost_ready': (c) => T('Almost ready!',           `Order #${c.orderNo} is almost ready! ~5 min remaining.`,     'طلبك على وشك الجهوز!',    `طلبك #${c.orderNo} على وشك الجهوز! متبقي ~5 دقائق.`),
  'order.ready':        (c) => T('Your order is ready!',    `Order #${c.orderNo} is ready — come collect it!`,            'طلبك جاهز!',              `طلبك #${c.orderNo} جاهز للاستلام — تفضل بالحضور!`),
  'order.completed':    ()  => T('Order completed',         `Thank you! Enjoy your Broast Albahr.`,                       'تم إكمال الطلب',          `شكراً لك! نتمنى لك وجبة شهية.`),
  'order.cancelled':    (c) => T('Order cancelled',         `Order #${c.orderNo} was cancelled${c.reason ? ': ' + c.reason : '.'}`, 'تم إلغاء الطلب',   `تم إلغاء طلبك #${c.orderNo}${c.reason ? ': ' + c.reason : '.'}`),
  'order.refunded':     (c) => T('Refund issued',           `Order #${c.orderNo} was refunded${c.amount ? ` — SR ${c.amount}` : '.'}`, 'تم إصدار الاسترجاع', `تم استرجاع طلبك #${c.orderNo}${c.amount ? ` — ${c.amount} ريال` : '.'}`),
  'reward.issued':      (c) => T('New reward unlocked',     `You've earned: ${c.label}. Code ${c.code}.`,                 'مكافأة جديدة',            `حصلت على: ${c.label}. الرمز ${c.code}.`, 'reward'),
  'reward.expiring':    (c) => T('Reward expiring soon',    `${c.label} expires ${c.expiresIn}. Use code ${c.code}.`,     'مكافأة على وشك الانتهاء', `${c.label} تنتهي ${c.expiresIn}. استعمل الرمز ${c.code}.`, 'reward'),
  'reward.redeemed':    (c) => T('Reward redeemed',         `You used ${c.label} on order #${c.orderNo}.`,                'تم استخدام المكافأة',     `تم استخدام ${c.label} في طلبك #${c.orderNo}.`, 'reward'),
  'points.earned':      (c) => T('Points earned',           `+${c.points} pts on order #${c.orderNo}. Balance: ${c.balance}.`, 'نقاط جديدة',        `+${c.points} نقطة على طلبك #${c.orderNo}. الرصيد: ${c.balance}.`, 'points'),
  'points.redeemed':    (c) => T('Points redeemed',         `-${c.points} pts for ${c.label}. Balance: ${c.balance}.`,    'تم استخدام النقاط',       `-${c.points} نقطة مقابل ${c.label}. الرصيد: ${c.balance}.`, 'points'),
  'streak.milestone':   (c) => T('Streak milestone!',       `${c.count} orders in a row — you unlocked ${c.label}!`,       'إنجاز في السلسلة!',       `${c.count} طلبات متتالية — حصلت على ${c.label}!`, 'streak'),
  'campaign.available': (c) => T('New offer for you',       c.body || 'Check the app for a limited-time offer.',           'عرض جديد لك',             c.bodyAr || 'افتح التطبيق لعرض حصري لوقت محدود.', 'campaign'),
  'tier.upgraded':      (c) => T(`Welcome to ${c.tier} ${c.emoji || ''}`.trim(), `You've reached the ${c.tier} tier — new perks unlocked!`, `مرحباً بك في ${c.tier} ${c.emoji || ''}`.trim(), `وصلت إلى مستوى ${c.tier} — امتيازات جديدة!`, 'tier'),
  'mission.available':  (c) => T('New mission',             c.body || `New mission: ${c.title}. Complete for a reward.`,  'مهمة جديدة',              c.bodyAr || `مهمة جديدة: ${c.titleAr || c.title || ''}. أكملها للمكافأة.`, 'mission'),
  'mission.completed':  (c) => T('Mission complete!',       `You completed "${c.title}" — ${c.reward || 'reward unlocked'}.`, 'أكملت المهمة!',      `أكملت "${c.titleAr || c.title || ''}" — ${c.rewardAr || c.reward || 'مكافأة'}.`, 'mission'),
};

export function render(name: TemplateName, ctx: Record<string, string>): Template {
  const fn = TEMPLATES[name];
  if (!fn) throw new Error(`unknown notification template: ${name}`);
  return fn(ctx);
}

export interface DispatchInput {
  templateName: TemplateName;
  ctx: Record<string, string>;
  /** Recipient — either uid (preferred) or phone (legacy inbox path). */
  uid?: string;
  phone: string;
  /** Stable dedup key. Same key = no-op on retry. */
  dedupKey: string;
  /** Optional metadata carried into the inbox item. */
  meta?: Record<string, unknown>;
}

export interface DispatchResult {
  ok: boolean;
  duplicate?: boolean;
  push?: 'sent' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Dispatch a notification. Writes:
 *   1. notifications_log/{dedupKey} — the audit row. Existence check acts as
 *      the dedup guard (setDoc with a fixed id + a check-then-set inside a
 *      transaction).
 *   2. notifications/{phone}/items/{auto} — the in-app inbox item.
 *   3. FCM push if customers/{uid}.fcmToken is set (best-effort — a failed
 *      push does NOT roll back the inbox write, since the customer would
 *      still see the message on next app open).
 */
export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  const db = getFirestore();
  const { templateName, ctx, phone, uid, dedupKey, meta } = input;
  if (!phone) return { ok: false, error: 'phone-required' };
  if (!dedupKey) return { ok: false, error: 'dedupKey-required' };

  const logRef = db.doc(`notifications_log/${encodeURIComponent(dedupKey)}`);
  const tmpl = render(templateName, ctx);
  const nowIso = new Date().toISOString();

  // Dedup: transactional insert of the log row acts as the single-writer lock.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (snap.exists) return false;
    tx.set(logRef, {
      templateName, dedupKey, phone,
      uid: uid || null,
      title: tmpl.title, body: tmpl.body,
      kind: tmpl.kind || null,
      status: 'claimed',
      claimedAt: FieldValue.serverTimestamp(),
      meta: meta || null,
    });
    return true;
  });
  if (!claimed) return { ok: true, duplicate: true };

  // Write inbox item.
  const inboxItem: Record<string, unknown> = {
    title: tmpl.title, body: tmpl.body,
    titleAr: tmpl.titleAr, bodyAr: tmpl.bodyAr,
    kind: tmpl.kind || 'order',
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (meta && typeof meta === 'object') Object.assign(inboxItem, meta);
  await db.collection(`notifications/${phone}/items`).add(inboxItem);

  // FCM push — best-effort. Requires the customer to have registered a token
  // (Phase 9 scaffold: customer app calls registerFcmToken with a VAPID key).
  let pushOutcome: 'sent' | 'skipped' | 'failed' = 'skipped';
  let pushErr: string | undefined;
  try {
    if (uid) {
      const custSnap = await db.doc(`customers/${uid}`).get();
      const tokens: string[] = [];
      if (custSnap.exists) {
        const d = custSnap.data() as any;
        if (typeof d.fcmToken === 'string' && d.fcmToken) tokens.push(d.fcmToken);
        if (Array.isArray(d.fcmTokens)) d.fcmTokens.forEach((t: any) => { if (typeof t === 'string' && t) tokens.push(t); });
      }
      if (tokens.length > 0) {
        const res = await getMessaging().sendEachForMulticast({
          tokens: Array.from(new Set(tokens)),
          notification: { title: tmpl.title, body: tmpl.body },
          data: {
            kind: tmpl.kind || 'order',
            titleAr: tmpl.titleAr,
            bodyAr: tmpl.bodyAr,
            ...(Object.fromEntries(Object.entries(meta || {}).map(([k, v]) => [k, String(v)]))),
          },
        });
        pushOutcome = res.successCount > 0 ? 'sent' : 'failed';
        if (res.failureCount > 0) pushErr = res.responses.find((r) => r.error)?.error?.message;
      }
    }
  } catch (err: any) {
    pushOutcome = 'failed';
    pushErr = err?.message || String(err);
  }

  await logRef.update({
    status: 'dispatched',
    dispatchedAt: FieldValue.serverTimestamp(),
    push: pushOutcome,
    pushError: pushErr || null,
    completedAt: nowIso,
  });

  return { ok: true, push: pushOutcome, error: pushErr };
}
