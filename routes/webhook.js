const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const verifyHeliusWebhook = require('../middleware/verifyHeliusWebhook');
const { matchAndClassify } = require('../lib/walletMatcher');

router.post('/webhook', verifyHeliusWebhook, async (req, res) => {
  // Respond immediately. Helius doesn't need to wait on our processing —
  // if we're slow, Helius may treat the delivery as failed and retry it,
  // which is exactly the duplicate-delivery scenario the dedup check below
  // exists to handle. Fast 200 first, real work after.
  res.sendStatus(200);

  // Enhanced webhooks deliver an array — usually one transaction, but
  // don't assume that.
  const transactions = Array.isArray(req.body) ? req.body : [req.body];

  for (const tx of transactions) {
    try {
      const signature = tx.signature;
      if (!signature) {
        console.warn('Webhook payload missing signature, skipping:', tx);
        continue;
      }

      // Dedup: a Helius retry, or a transaction touching multiple tracked
      // wallets, could send the same signature more than once.
      const alreadyProcessed = await Event.exists({ txSignature: signature });
      if (alreadyProcessed) {
        console.log(`Skipping already-processed signature: ${signature}`);
        continue;
      }

      const matches = await matchAndClassify(tx);
      if (matches.length === 0) {
        console.log(`No qualifying buy/sell for signature ${signature}, skipping`);
        continue;
      }

      // Birdeye enrichment + Event.create come next — for now, confirming
      // real classification results are landing correctly.
      console.log(`Classified ${matches.length} match(es) for ${signature}:`, matches);
    } catch (err) {
      // Response is already sent — nothing to return, just log and move on.
      // A transient Mongo hiccup on one transaction should never be able to
      // take down the whole process, which would also kill the bot's
      // Telegram polling running in the same process.
      console.error(`Error processing transaction ${tx.signature ?? '(unknown)'}:`, err.message);
    }
  }
});

module.exports = router;
