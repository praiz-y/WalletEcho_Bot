const TrackedWallet = require('../models/TrackedWallet');
const WatchedAddress = require('../models/WatchedAddress');
const { syncHeliusWebhook } = require('./helius');

const MAX_WALLETS_PER_USER = 5;
// Loose Solana address format check — base58 alphabet, 32-44 chars.
// Doesn't confirm the address actually exists on-chain, just that it's
// shaped like a real one. Good enough to catch typos for MVP.
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function trackWallet(userId, walletAddress, nickname) {
  if (!SOLANA_ADDRESS_REGEX.test(walletAddress)) {
    return { error: "That doesn't look like a valid Solana address. Double-check and try again." };
  }

  const activeCount = await TrackedWallet.countDocuments({ userId, status: 'active' });
  if (activeCount >= MAX_WALLETS_PER_USER) {
    return { error: "You're at your limit — remove a wallet first." };
  }

  const nicknameLower = nickname.toLowerCase();

  const duplicateWallet = await TrackedWallet.findOne({ userId, walletAddress });
  if (duplicateWallet) {
    return { error: "You're already tracking that wallet." };
  }

  const duplicateNickname = await TrackedWallet.findOne({ userId, nicknameLower });
  if (duplicateNickname) {
    return { error: `You already have a wallet named "${nickname}" — pick a different name.` };
  }

  // Figure out whether this address is brand new to the system (needs
  // Helius to start watching it) or already watched by someone else.
  let watched = await WatchedAddress.findOne({ address: walletAddress });
  const isNewAddress = !watched || watched.trackerCount === 0;

  if (isNewAddress) {
    // Call Helius BEFORE touching MongoDB. If this fails, nothing in our
    // database changes, so the two systems can never end up disagreeing.
    if (!watched) watched = new WatchedAddress({ address: walletAddress, trackerCount: 0 });
    watched.trackerCount += 1;
    await watched.save(); // save first so syncHeliusWebhook sees the updated count

    try {
      await syncHeliusWebhook();
    } catch (err) {
      console.error('syncHeliusWebhook failed (track):', err.message);
      // Roll back — Helius didn't confirm, so we shouldn't claim it's tracked.
      watched.trackerCount -= 1;
      await watched.save();
      return { error: "Couldn't add that wallet right now — please try again in a moment." };
    }
  } else {
    watched.trackerCount += 1;
    await watched.save();
  }

  const tracked = await TrackedWallet.create({
    userId,
    walletAddress,
    nickname,
    nicknameLower,
    status: 'active',
  });

  return { success: tracked };
}

async function removeWallet(userId, nicknameLower) {
  const tracked = await TrackedWallet.findOne({ userId, nicknameLower });
  if (!tracked) {
    return { error: `No wallet named "${nicknameLower}" found.` };
  }

  const watched = await WatchedAddress.findOne({ address: tracked.walletAddress });
  const willUnregister = watched && watched.trackerCount === 1;

  if (willUnregister) {
    // Same principle as adding: call Helius first, only commit the
    // MongoDB deletion if Helius confirms the updated list.
    watched.trackerCount = 0;
    await watched.save();

    try {
      await syncHeliusWebhook();
    } catch (err) {
      console.error('syncHeliusWebhook failed (remove):', err.message);
      watched.trackerCount = 1; // roll back
      await watched.save();
      return { error: "Couldn't remove that wallet right now — please try again in a moment." };
    }
  } else if (watched) {
    watched.trackerCount -= 1;
    await watched.save();
  }

  await tracked.deleteOne();
  return { success: true };
}

async function renameWallet(userId, oldNicknameLower, newNickname) {
  const tracked = await TrackedWallet.findOne({ userId, nicknameLower: oldNicknameLower });
  if (!tracked) {
    return { error: `No wallet named "${oldNicknameLower}" found.` };
  }

  const newNicknameLower = newNickname.toLowerCase();
  const duplicate = await TrackedWallet.findOne({ userId, nicknameLower: newNicknameLower });
  if (duplicate) {
    return { error: `You already have a wallet named "${newNickname}" — pick a different name.` };
  }

  tracked.nickname = newNickname;
  tracked.nicknameLower = newNicknameLower; // pre('save') would also set this, but being explicit here
  await tracked.save();
  return { success: tracked };
}

async function setWalletStatus(userId, nicknameLower, status) {
  const tracked = await TrackedWallet.findOne({ userId, nicknameLower });
  if (!tracked) {
    return { error: `No wallet named "${nicknameLower}" found.` };
  }
  // Pausing/resuming never touches Helius — Helius keeps watching regardless,
  // this only controls whether alerts get delivered to this user.
  tracked.status = status;
  await tracked.save();
  return { success: tracked };
}

async function listWallets(userId) {
  return TrackedWallet.find({ userId }).sort({ createdAt: 1 });
}

module.exports = { trackWallet, removeWallet, renameWallet, setWalletStatus, listWallets };