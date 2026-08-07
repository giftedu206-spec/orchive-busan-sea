import admin from 'firebase-admin';

function firebaseAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const db = firebaseAdmin();
    const token = String(req.headers.authorization || '').replace('Bearer ', '');
    const sender = await admin.auth().verifyIdToken(token);
    const { recipientId, amount } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const value = Number(amount);
    if (!recipientId || recipientId === sender.uid || ![10, 50, 100].includes(value)) throw new Error('Invalid gift request');
    const first = db.doc(`friendRequests/${sender.uid}_${recipientId}`);
    const second = db.doc(`friendRequests/${recipientId}_${sender.uid}`);
    const senderRef = db.doc(`orchiveUsers/${sender.uid}`);
    const recipientRef = db.doc(`orchiveUsers/${recipientId}`);
    await db.runTransaction(async transaction => {
      const [direct, reverse, senderData, recipientData] = await Promise.all([transaction.get(first), transaction.get(second), transaction.get(senderRef), transaction.get(recipientRef)]);
      const friendship = direct.exists ? direct.data() : reverse.data();
      if (friendship?.status !== 'accepted') throw new Error('Friends only');
      const exp = Number(senderData.data()?.profile?.exp || 0);
      if (!recipientData.exists || exp < value) throw new Error('Not enough EXP');
      transaction.update(senderRef, { 'profile.exp': exp - value });
      transaction.update(recipientRef, { 'profile.exp': Number(recipientData.data()?.profile?.exp || 0) + value });
      transaction.set(db.collection('expGifts').doc(), { from: sender.uid, to: recipientId, amount: value, createdAt: Date.now() });
    });
    return res.status(200).json({ ok: true });
  } catch (error) { return res.status(400).json({ error: error.message || 'Gift failed' }); }
}
