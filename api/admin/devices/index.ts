import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listSubscriptions } from '../../../lib/store';

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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const subs = await listSubscriptions();
    const devices = subs.map(({ id, label, status, createdAt, lastSeenAt }) => ({
      id,
      label,
      status,
      createdAt,
      lastSeenAt,
    }));
    return res.status(200).json(devices);
  } catch (err) {
    console.error('List devices error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
