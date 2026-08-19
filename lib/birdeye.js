const BIRDEYE_BASE = 'https://public-api.birdeye.so';
const { WSOL_MINT } = require('./transactionParser');

function headers() {
  return {
    accept: 'application/json',
    'X-API-KEY': process.env.BIRDEYE_API_KEY,
    'x-chain': 'solana',
  };
}

// Returns null on ANY failure — never throws, never returns a fake 0.
// Callers are responsible for treating null as "Unknown", not "zero" or "safe".
async function safeFetch(url) {
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      console.warn(`Birdeye request failed (${res.status}): ${url}`);
      return null;
    }
    const json = await res.json();
    return json.success ? json.data : null;
  } catch (err) {
    console.warn(`Birdeye request errored: ${url}`, err.message);
    return null;
  }
}

async function getSolPriceUsd() {
  // Confirmed against a live call (2026-08-19): field is `value`.
  const data = await safeFetch(`${BIRDEYE_BASE}/defi/price?address=${WSOL_MINT}`);
  return data?.value ?? null;
}

async function getTokenPriceAndLiquidity(mint) {
  // Confirmed against a live call (2026-08-19): both fields correct as guessed.
  const data = await safeFetch(`${BIRDEYE_BASE}/defi/price?address=${mint}&include_liquidity=true`);
  return {
    price: data?.value ?? null,
    liquidity: data?.liquidity ?? null,
  };
}

async function getTokenOverview(mint) {
  // Confirmed against a live call (2026-08-19): field is `priceChange5mPercent`.
  const data = await safeFetch(`${BIRDEYE_BASE}/defi/token_overview?address=${mint}`);
  return {
    fiveMinChange: data?.priceChange5mPercent ?? null,
  };
}

async function getTokenSecurity(mint) {
  const data = await safeFetch(`${BIRDEYE_BASE}/defi/token_security?address=${mint}`);
  if (!data) return null;
  return {
    // NOT live-verified — this endpoint 401s on the current BIRDEYE_API_KEY
    // ("lacks sufficient permissions"), a plan/tier limitation, not a bug.
    // Cross-checked against Birdeye's published docs instead:
    //
    // No documented Solana field corresponds to "mint authority still
    // held." The original guess (`data.mintAuthority`) doesn't exist in
    // Birdeye's schema, and since `undefined != null` is `false`, it was
    // silently reporting every token as NOT drainable — a false sense of
    // safety on a safety check. Forced to null until a real field is
    // confirmed with an upgraded key; do not guess again here.
    canDrain: null,
    // Birdeye documents a purpose-built boolean for this instead of
    // inferring it from the freezeAuthority address.
    isHoneypot: data.freezeable ?? null,
    // `holderCount` is documented as EVM-only; Solana responses have no
    // direct equivalent on this endpoint (top10Holder*/top10User* cover
    // concentration, not a raw count). Left null rather than guessed.
    holderCount: null,
    topHolderPct: data.top10HolderPercent ?? null, // confirmed via docs
    poolCreatedAt: data.creationTime ?? null,       // confirmed via docs, unix seconds
  };
}

module.exports = { getSolPriceUsd, getTokenPriceAndLiquidity, getTokenOverview, getTokenSecurity };
