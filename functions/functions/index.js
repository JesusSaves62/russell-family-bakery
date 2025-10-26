const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');

admin.initializeApp();
const db = admin.firestore();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM,              // e.g. +14805551234 (your Twilio number)
  ALERT_TO,                 // e.g. +14805559876 or comma-separated list
  RECEIPT_BASE_URL          // e.g. https://YOUR_USERNAME.github.io/family-treats/receipt.html
} = process.env;

async function sendSMS(toCsv, body) {
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const targets = (toCsv || "").split(',').map(s => s.trim()).filter(Boolean);
  const tasks = targets.map(to => client.messages.create({ to, from: TWILIO_FROM, body }));
  return Promise.all(tasks);
}

exports.onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, ctx) => {
    const orderId = ctx.params.orderId;
    const o = snap.data() || {};

    if (o.smsNotified) return null;

    const name = o?.customer?.name || 'Customer';
    const email = o?.customer?.email || '';
    const total = Number(o?.total || 0).toFixed(2);
    const items = (o.items || []).map(it => `${it.qty}× ${it.name}`).join(', ').slice(0, 200);
    const receiptUrl = RECEIPT_BASE_URL ? `${RECEIPT_BASE_URL}?oid=${encodeURIComponent(orderId)}` : '';

    const msg =
      `New order: $${total}\n` +
      `From: ${name}${email ? ` (${email})` : ''}\n` +
      (items ? `Items: ${items}\n` : '') +
      (receiptUrl ? `Receipt: ${receiptUrl}` : '');

    try {
      await sendSMS(ALERT_TO, msg);
      await snap.ref.set({ smsNotified: true }, { merge: true });
      return true;
    } catch (err) {
      console.error('SMS send failed:', err);
      await snap.ref.set({ smsError: String(err) }, { merge: true });
      return false;
    }
  });
