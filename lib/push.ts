import webpush from 'web-push';
import { listSubscriptions, deleteSubscription, type Subscription } from './store';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export interface NotifyPayload {
  title: string;
  body?: string;
  icon?: string;
  url?: string;
}

export async function sendNotifications(
  target: string,
  payload: NotifyPayload,
): Promise<{ sent: number; failed: number }> {
  const all = await listSubscriptions();
  const approved = all.filter(s => s.status === 'approved');
  const targets =
    target === 'all' ? approved : approved.filter(s => s.label === target);

  return dispatch(targets, payload);
}

async function dispatch(
  subs: Subscription[],
  payload: NotifyPayload,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await deleteSubscription(sub.id);
        }
        failed++;
      }
    }),
  );

  return { sent, failed };
}
