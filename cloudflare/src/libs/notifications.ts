import { logger } from './logger';

/**
 * Lightweight notification system backed by Cloudflare KV.
 * Stores per-user notifications as a JSON array under `notifications:{did}`.
 * Frontend polls via GET /api/user/notifications or receives via SSE.
 */

export interface Notification {
  id: string;
  type: 'credit_granted' | 'payment_completed' | 'welcome_credit';
  title: string;
  message: string;
  link?: string;
  createdAt: number;
  read: boolean;
}

const KV_PREFIX = 'notifications:';
const MAX_NOTIFICATIONS = 50;

export async function getNotifications(kv: KVNamespace, userDid: string): Promise<Notification[]> {
  const raw = await kv.get(`${KV_PREFIX}${userDid}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addNotification(
  kv: KVNamespace,
  userDid: string,
  notification: Omit<Notification, 'id' | 'createdAt' | 'read'>
): Promise<void> {
  try {
    const existing = await getNotifications(kv, userDid);
    const entry: Notification = {
      ...notification,
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      read: false,
    };
    const updated = [entry, ...existing].slice(0, MAX_NOTIFICATIONS);
    await kv.put(`${KV_PREFIX}${userDid}`, JSON.stringify(updated), { expirationTtl: 90 * 86400 });
  } catch (err) {
    logger.error('Failed to add notification', {
      userDid,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function markNotificationsRead(kv: KVNamespace, userDid: string, ids?: string[]): Promise<void> {
  const existing = await getNotifications(kv, userDid);
  const updated = existing.map((n) =>
    !ids || ids.includes(n.id) ? { ...n, read: true } : n
  );
  await kv.put(`${KV_PREFIX}${userDid}`, JSON.stringify(updated), { expirationTtl: 90 * 86400 });
}

/** Build a credit-granted notification with bilingual support. */
export function buildCreditGrantedNotification(params: {
  amount: number | string;
  isWelcome?: boolean;
  locale?: string;
}): Omit<Notification, 'id' | 'createdAt' | 'read'> {
  const zh = params.locale?.startsWith('zh');
  const amount = params.amount;

  if (params.isWelcome) {
    return {
      type: 'welcome_credit',
      title: zh ? '欢迎！您已获得免费额度' : 'Welcome! Free credits granted',
      message: zh
        ? `您已获得 ${amount} 积分，立即体验 AI 功能吧！`
        : `You've received ${amount} credits. Try out the AI features now!`,
      link: '/playground',
    };
  }

  return {
    type: 'credit_granted',
    title: zh ? '积分已到账' : 'Credits received',
    message: zh
      ? `${amount} 积分已充值到您的账户。`
      : `${amount} credits have been added to your account.`,
    link: '/credit-usage',
  };
}
