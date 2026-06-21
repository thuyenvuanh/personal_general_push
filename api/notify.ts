import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendNotifications } from '../lib/push';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${process.env.API_SECRET_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, body, icon, url, target = 'all' } = req.body ?? {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Missing title' });
  }

  try {
    const result = await sendNotifications(target, {
      title,
      body,
      icon: icon ?? '/icons/icon.svg',
      url,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
