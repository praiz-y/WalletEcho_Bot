const WatchedAddress = require('../models/WatchedAddress');
const Config = require('../models/Config');

const HELIUS_API_BASE = 'https://api-mainnet.helius-rpc.com/v0';

// Pushes the FULL current list of watched addresses to Helius.
// Called any time the watched set changes (wallet added or removed).
// Creates the webhook on the very first call; patches it on every call after.
async function syncHeliusWebhook() {
  const watched = await WatchedAddress.find({ trackerCount: { $gt: 0 } });
  const addresses = watched.map((w) => w.address);

  const config = await Config.findOne({ key: 'heliusWebhookId' });

  // Strip any trailing slash so this doesn't produce a double slash
  // (e.g. WEBHOOK_URL="https://host.com/" -> "https://host.com//webhook",
  // which Express's router won't match — confirmed the hard way).
  const webhookBaseUrl = process.env.WEBHOOK_URL.replace(/\/+$/, '');

  // Helius's PUT endpoint validates the full webhook object, not just the
  // fields being changed — it isn't a partial patch, so both create and
  // update send this same complete payload.
  const payload = {
    webhookURL: `${webhookBaseUrl}/webhook`,
    transactionTypes: ['SWAP'],
    accountAddresses: addresses,
    webhookType: 'enhanced',
    authHeader: process.env.HELIUS_WEBHOOK_SECRET,
  };

  if (!config) {
    // No webhook exists yet — create one.
    const res = await fetch(
      `${HELIUS_API_BASE}/webhooks?api-key=${process.env.HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Helius webhook creation failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    await Config.create({ key: 'heliusWebhookId', value: data.webhookID });
    return;
  }

  // Webhook already exists — update its address list to match our DB exactly.
  const res = await fetch(
    `${HELIUS_API_BASE}/webhooks/${config.value}?api-key=${process.env.HELIUS_API_KEY}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helius webhook update failed: ${res.status} ${body}`);
  }
}

// Fetches a wallet's current SOL balance via Helius's RPC endpoint.
// Used by /balance and /list — always live, never cached.
async function getSolBalance(address) {
  const res = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
    }
  );

  const data = await res.json();
  const lamports = data.result?.value ?? 0;
  return lamports / 1e9; // convert lamports to SOL
}

module.exports = { syncHeliusWebhook, getSolBalance };