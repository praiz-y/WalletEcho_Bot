// Solana's canonical mint addresses for the "cash" side of a trade.
// Wrapped SOL gets folded into the same 'SOL' bucket as native SOL below,
// since they're economically the same thing for our purposes.
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const CASH_MINTS = ['SOL', USDC_MINT, USDT_MINT];

// Tiny SOL movements (network fees, rent) shouldn't be mistaken for a real
// swap leg. Anything smaller than this gets treated as noise.
const DUST_THRESHOLD_SOL = 0.001;

/**
 * Classifies a single Helius enhanced transaction as a buy, sell, or
 * not-a-qualifying-trade, from ONE tracked wallet's perspective.
 *
 * Approach: compute the wallet's net balance change per mint across the
 * whole transaction, rather than looking at individual transfer legs.
 * This means multi-hop routes (SOL -> USDC -> TOKEN via Jupiter) resolve
 * correctly for free — the intermediate USDC leg nets to zero for the
 * wallet, leaving a clean SOL-in/token-out result.
 *
 * Returns null for anything that doesn't resolve to exactly one token
 * leg against exactly one cash leg — deliberately discarded rather than
 * guessed at (token-to-token swaps, NFT trades, multi-token batches, etc.)
 */
function classifyTransaction(tx, walletAddress) {
  const netByMint = {};

  // Native SOL transfers (amounts arrive in lamports).
  for (const t of tx.nativeTransfers || []) {
    if (t.toUserAccount === walletAddress) {
      netByMint.SOL = (netByMint.SOL || 0) + t.amount / 1e9;
    }
    if (t.fromUserAccount === walletAddress) {
      netByMint.SOL = (netByMint.SOL || 0) - t.amount / 1e9;
    }
  }

  // Token transfers — Helius's enhanced parser already gives tokenAmount
  // as a decimal-adjusted UI amount, so no manual decimals math needed.
  for (const t of tx.tokenTransfers || []) {
    // NFT legs (tokenStandard !== 'Fungible') aren't a token trade in the
    // sense this function cares about — skip them so a transaction with
    // an NFT leg falls through to the "not exactly one token leg" null
    // case below, instead of being bucketed as if it were a real token.
    if (t.tokenStandard && t.tokenStandard !== 'Fungible') continue;

    const bucket = t.mint === WSOL_MINT ? 'SOL' : t.mint;
    if (t.toUserAccount === walletAddress) {
      netByMint[bucket] = (netByMint[bucket] || 0) + t.tokenAmount;
    }
    if (t.fromUserAccount === walletAddress) {
      netByMint[bucket] = (netByMint[bucket] || 0) - t.tokenAmount;
    }
  }

  // Dust filter: a SOL "leg" this small is fee/rent noise, not a real trade side.
  if (netByMint.SOL !== undefined && Math.abs(netByMint.SOL) < DUST_THRESHOLD_SOL) {
    delete netByMint.SOL;
  }

  // Drop anything that netted to ~zero (e.g. an intermediate hop that
  // fully round-tripped through the wallet).
  for (const mint of Object.keys(netByMint)) {
    if (Math.abs(netByMint[mint]) < 1e-9) delete netByMint[mint];
  }

  const cashEntries = Object.entries(netByMint).filter(([mint]) => CASH_MINTS.includes(mint));
  const tokenEntries = Object.entries(netByMint).filter(([mint]) => !CASH_MINTS.includes(mint));

  // Only accept the clean shape: exactly one cash leg, exactly one token leg.
  if (cashEntries.length !== 1 || tokenEntries.length !== 1) {
    return null;
  }

  const [cashMint, cashAmount] = cashEntries[0];
  const [tokenMint, tokenAmount] = tokenEntries[0];

  if (cashAmount < 0 && tokenAmount > 0) {
    return { type: 'buy', tokenMint, tokenAmount, cashMint, cashAmount: Math.abs(cashAmount) };
  }
  if (cashAmount > 0 && tokenAmount < 0) {
    return { type: 'sell', tokenMint, tokenAmount: Math.abs(tokenAmount), cashMint, cashAmount };
  }

  // Same-sign cash/token movement isn't a normal swap shape — discard
  // rather than guess at what happened.
  return null;
}

module.exports = { classifyTransaction, WSOL_MINT, USDC_MINT, USDT_MINT };
