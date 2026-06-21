import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export interface Subscription {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label: string;
  topics: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  lastSeenAt: string;
}

function epKey(endpoint: string): string {
  return `ep:${Buffer.from(endpoint).toString('base64url')}`;
}

export async function upsertSubscription(data: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label: string;
  topics?: string[];
}): Promise<Subscription> {
  const existing = await getSubscriptionByEndpoint(data.endpoint);

  if (existing) {
    if (existing.status === 'rejected') return existing;
    const updated: Subscription = { ...existing, lastSeenAt: new Date().toISOString() };
    await redis.set(`sub:${existing.id}`, updated);
    return updated;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const sub: Subscription = {
    id,
    endpoint: data.endpoint,
    keys: data.keys,
    label: data.label,
    topics: data.topics ?? [],
    status: 'pending',
    createdAt: now,
    lastSeenAt: now,
  };

  await Promise.all([
    redis.set(`sub:${id}`, sub),
    redis.set(epKey(data.endpoint), id),
    redis.sadd('subs', id),
  ]);

  return sub;
}

export async function getSubscriptionByEndpoint(endpoint: string): Promise<Subscription | null> {
  const id = await redis.get<string>(epKey(endpoint));
  if (!id) return null;
  return getSubscriptionById(id);
}

export async function getSubscriptionById(id: string): Promise<Subscription | null> {
  return redis.get<Subscription>(`sub:${id}`);
}

export async function listSubscriptions(): Promise<Subscription[]> {
  const ids = await redis.smembers<string[]>('subs');
  if (!ids.length) return [];
  const subs = await redis.mget<(Subscription | null)[]>(...ids.map(id => `sub:${id}`));
  return subs.filter((s): s is Subscription => s !== null);
}

export async function updateSubscriptionStatus(
  id: string,
  status: Subscription['status'],
): Promise<Subscription | null> {
  const sub = await getSubscriptionById(id);
  if (!sub) return null;
  const updated: Subscription = { ...sub, status };
  await redis.set(`sub:${id}`, updated);
  return updated;
}

export async function deleteSubscription(id: string): Promise<void> {
  const sub = await getSubscriptionById(id);
  if (!sub) return;
  await Promise.all([
    redis.del(`sub:${id}`),
    redis.del(epKey(sub.endpoint)),
    redis.srem('subs', id),
  ]);
}

export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const sub = await getSubscriptionByEndpoint(endpoint);
  if (sub) await deleteSubscription(sub.id);
}
