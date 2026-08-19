const { getSolPriceUsd, getTokenPriceAndLiquidity, getTokenOverview, getTokenSecurity } = require('./birdeye');
const { WSOL_MINT, USDC_MINT, USDT_MINT } = require('./transactionParser');

const LIQUIDITY_THRESHOLDS = { low: 5000, moderate: 50000 }; // starting points, expect to tune

function liquidityLabel(liquidity) {
  if (liquidity == null) return 'Unknown';
  if (liquidity < LIQUIDITY_THRESHOLDS.low) return 'low';
  if (liquidity < LIQUIDITY_THRESHOLDS.moderate) return 'moderate';
  return 'good';
}

function tokenAgeHours(poolCreatedAt) {
  if (!poolCreatedAt) return null;
  const createdMs = poolCreatedAt * 1000; // assuming unix seconds — VERIFY
  return (Date.now() - createdMs) / (1000 * 60 * 60);
}

/**
 * Takes one classified match from matchAndClassify and returns the full
 * set of fields Event needs. Every Birdeye call is independent — one
 * failing doesn't block the others, and a missing value stays null
 * (rendered as "Unknown"/"Not checked" by the alert formatter later,
 * never treated as zero or safe).
 */
async function enrichEvent(match) {
  const { tokenMint, cashMint, cashAmount, tokenAmount, type } = match;

  // Cash side to USD: stablecoins are ~1:1, SOL needs a live price.
  let amountUsd = null;
  let amountSol = null;
  if (cashMint === USDC_MINT || cashMint === USDT_MINT) {
    amountUsd = cashAmount;
  } else if (cashMint === 'SOL') {
    amountSol = cashAmount;
    const solPrice = await getSolPriceUsd();
    amountUsd = solPrice != null ? cashAmount * solPrice : null;
  }

  const [priceLiquidity, overview, security] = await Promise.all([
    getTokenPriceAndLiquidity(tokenMint),
    getTokenOverview(tokenMint),
    getTokenSecurity(tokenMint),
  ]);

  return {
    tokenMint,
    amountSol,
    amountUsd,
    priceAtEvent: priceLiquidity.price,
    liquidity: priceLiquidity.liquidity,
    liquidityLabel: liquidityLabel(priceLiquidity.liquidity),
    fiveMinChange: overview.fiveMinChange,
    safetyCheck: security
      ? {
          canDrain: security.canDrain,
          isHoneypot: security.isHoneypot,
          liquidityOk: priceLiquidity.liquidity != null ? priceLiquidity.liquidity >= LIQUIDITY_THRESHOLDS.low : null,
          holderCount: security.holderCount,
          topHolderPct: security.topHolderPct,
          tokenAgeHours: tokenAgeHours(security.poolCreatedAt),
        }
      : null, // entire security check unavailable — alert formatter should show "Not checked" across the board, plus the partial-data flag
  };
}

module.exports = { enrichEvent };
