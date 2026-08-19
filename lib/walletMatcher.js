const WatchedAddress = require('../models/WatchedAddress');
const { classifyTransaction } = require('./transactionParser');

/**
 * Given a raw Helius transaction, finds which of our watched addresses
 * were actually involved, and returns a classified buy/sell result for
 * each one independently.
 *
 * A single transaction can legitimately touch more than one tracked
 * wallet — e.g. two different users each track a different wallet, and
 * both happen to appear in the same transaction. Each gets its own
 * classification rather than assuming there's only one relevant wallet.
 */
async function matchAndClassify(tx) {
  const involvedAddresses = new Set();

  for (const t of tx.nativeTransfers || []) {
    if (t.fromUserAccount) involvedAddresses.add(t.fromUserAccount);
    if (t.toUserAccount) involvedAddresses.add(t.toUserAccount);
  }
  for (const t of tx.tokenTransfers || []) {
    if (t.fromUserAccount) involvedAddresses.add(t.fromUserAccount);
    if (t.toUserAccount) involvedAddresses.add(t.toUserAccount);
  }

  if (involvedAddresses.size === 0) return [];

  // Match against everything currently registered with Helius, regardless
  // of any individual user's pause status — pausing only mutes alerts,
  // it never stops the underlying watch, so the event should still be
  // recognized here even if nobody ends up getting notified for it.
  const watched = await WatchedAddress.find({
    address: { $in: Array.from(involvedAddresses) },
    trackerCount: { $gt: 0 },
  });

  const results = [];
  for (const w of watched) {
    const classification = classifyTransaction(tx, w.address);
    if (classification) {
      results.push({ walletAddress: w.address, ...classification });
    }
  }
  return results;
}

module.exports = { matchAndClassify };
