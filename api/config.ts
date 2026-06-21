import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY });
}
