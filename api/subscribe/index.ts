import type { VercelRequest, VercelResponse } from '@vercel/node';
import { upsertSubscription, deleteSubscriptionByEndpoint } from '../../lib/store';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const { endpoint, keys, label, topics } = req.body ?? {};

    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'Missing endpoint' });
    }
    if (!keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Missing keys' });
    }
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'Missing label' });
    }

    try {
      const sub = await upsertSubscription({ endpoint, keys, label, topics });
      return res.status(200).json({ id: sub.id, status: sub.status });
    } catch (err) {
      console.error('Subscribe error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body ?? {};
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    try {
      await deleteSubscriptionByEndpoint(endpoint);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Unsubscribe error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
