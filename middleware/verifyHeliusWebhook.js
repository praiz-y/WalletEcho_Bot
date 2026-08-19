const crypto = require('crypto');

// Confirms the request really came from Helius, not a random hit on this
// public URL. Helius includes the authHeader value we set when creating
// the webhook — anything missing or mismatched gets rejected immediately,
// before touching the database or doing any real work.
function verifyHeliusWebhook(req, res, next) {
  const authHeader = req.headers['authorization'];
  const expected = process.env.HELIUS_WEBHOOK_SECRET;

  if (!authHeader) {
    console.warn('Webhook rejected: missing auth header');
    return res.sendStatus(401);
  }

  // Constant-time comparison so a failed match doesn't leak timing info
  // about how much of the secret was correct. timingSafeEqual throws on
  // mismatched buffer lengths, so that's checked explicitly first.
  const authBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expected);

  const isValid =
    authBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(authBuffer, expectedBuffer);

  if (!isValid) {
    console.warn('Webhook rejected: auth header mismatch');
    return res.sendStatus(401);
  }

  next();
}

module.exports = verifyHeliusWebhook;
