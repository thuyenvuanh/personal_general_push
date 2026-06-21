import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteSubscription } from '../../../lib/store';

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

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    await deleteSubscription(id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Delete device error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
