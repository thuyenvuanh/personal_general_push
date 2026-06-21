import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateSubscriptionStatus } from '../../../../lib/store';

function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${process.env.API_SECRET_KEY}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    const sub = await updateSubscriptionStatus(id, 'rejected');
    if (!sub) return res.status(404).json({ error: 'Device not found' });
    return res.status(200).json({ ok: true, status: sub.status });
  } catch (err) {
    console.error('Reject error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
