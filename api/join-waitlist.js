// /api/join-waitlist.js
// Vercel serverless function — lets anyone become an ambassador without a
// KLAVE account. Creates a 'waitlist' doc in the same Firestore project as
// the main app, with a unique referral code. If the email already joined,
// returns their existing code instead of creating a duplicate.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

function slugify(str) {
  return str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email } = req.body || {};
  if (!name || !email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid name and email are required' });
  }

  try {
    const emailLower = email.trim().toLowerCase();

    // Already joined? Hand back their existing code instead of a duplicate.
    const existing = await db.collection('waitlist').where('email', '==', emailLower).limit(1).get();
    if (!existing.empty) {
      return res.status(200).json({ code: existing.docs[0].data().code, existing: true });
    }

    // Build a unique code from their name + a short random suffix.
    const base = slugify(name) || 'friend';
    let code = base;
    let attempt = 0;
    while (true) {
      const clash = await db.collection('waitlist').where('code', '==', code).limit(1).get();
      if (clash.empty) break;
      attempt++;
      code = `${base}-${Math.random().toString(36).slice(2, 5)}`;
      if (attempt > 5) break; // extremely unlikely, but don't loop forever
    }

    await db.collection('waitlist').add({
      name: name.trim(),
      email: emailLower,
      code,
      referralCount: 0,
      referralEarnings: 0,
      pendingReferralPayout: 0,
      bankDetails: null,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ code, existing: false });
  } catch (err) {
    console.error('join-waitlist failed:', err);
    return res.status(500).json({ error: 'Could not join the waitlist right now' });
  }
}
