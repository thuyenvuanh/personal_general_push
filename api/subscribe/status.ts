import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSubscriptionByEndpoint } from '../../lib/store';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { endpoint } = req.query;
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  try {
    const sub = await getSubscriptionByEndpoint(endpoint);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ status: sub.status });
  } catch (err) {
    console.error('Status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
