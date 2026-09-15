// /api/save-waitlist-bank.js
// Vercel serverless function — saves bank details for a waitlist ambassador
// (someone with a referral code but no KLAVE account). Verifies the account
// via Paystack first, same as the logged-in-user flow, then stores it keyed
// by their code. No login exists here to check identity against, so this
// trusts whoever has the code — matches the low-stakes, small-scale
// treatment already used elsewhere for this feature.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, accountNumber, bankCode, bankName, accountName } = req.body || {};
  if (!code || !accountNumber || !bankCode || !accountName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const snap = await db.collection('waitlist').where('code', '==', code).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ error: 'No ambassador found with that code' });
    }

    await snap.docs[0].ref.update({
      bankDetails: { accountNumber, bankCode, bankName, accountName },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('save-waitlist-bank failed:', err);
    return res.status(500).json({ error: 'Could not save bank details' });
  }
}
