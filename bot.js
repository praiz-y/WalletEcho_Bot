const { Telegraf } = require('telegraf');
const User = require('./models/User');
const { trackWallet, removeWallet, renameWallet, setWalletStatus, listWallets } = require('./lib/wallets');
const { getSolBalance } = require('./lib/helius');

// Polling mode — the bot asks Telegram for new messages itself, rather than
// Telegram pushing to a webhook URL. Simpler for now: one less public route
// to secure, and no SSL/webhook registration needed with Telegram directly.
const bot = new Telegraf(process.env.BOT_TOKEN);

// Runs before every command — ensures a User document exists for whoever's messaging.
async function getOrCreateUser(ctx) {
  const telegramId = String(ctx.from.id);
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({
      telegramId,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
  }
  return user;
}

// ctx.message.text includes the command itself (e.g. "/track abc123 fren");
// split it off so args only contains what came after the command.
function getArgs(ctx) {
  return ctx.message.text.trim().split(/\s+/).slice(1);
}

const HELP_TEXT = [
  'WalletEcho tracks Solana wallets and alerts you on their swap activity.',
  '',
  '/track <address> <nickname> — start tracking a wallet',
  '/remove <nickname> — stop tracking a wallet',
  '/rename <current nickname> <new nickname> — rename a tracked wallet',
  '/pause <nickname> — mute alerts without untracking',
  '/resume <nickname> — unmute alerts',
  '/list — show all tracked wallets and their live balances',
  '/balance <nickname> — check one wallet\'s live balance',
  '/help — show this message',
].join('\n');

bot.command('help', (ctx) => ctx.reply(HELP_TEXT));

bot.command('track', async (ctx) => {
  const args = getArgs(ctx);

  if (args.length !== 2) {
    return ctx.reply('Usage: /track <address> <nickname>\n\nType /help for more.');
  }

  const [address, nickname] = args;
  const user = await getOrCreateUser(ctx);
  const result = await trackWallet(user._id, address, nickname);

  if (result.error) {
    return ctx.reply(result.error);
  }
  ctx.reply(`Now tracking "${nickname}" (${address.slice(0, 4)}...${address.slice(-4)})`);
});

bot.command('remove', async (ctx) => {
  const nickname = getArgs(ctx)[0];

  if (!nickname) {
    return ctx.reply('Usage: /remove <nickname>\n\nType /help for more.');
  }

  const user = await getOrCreateUser(ctx);
  const result = await removeWallet(user._id, nickname.toLowerCase());

  if (result.error) {
    return ctx.reply(result.error);
  }
  ctx.reply(`Stopped tracking "${nickname}".`);
});

bot.command('rename', async (ctx) => {
  const args = getArgs(ctx);

  if (args.length !== 2) {
    return ctx.reply('Usage: /rename <current nickname> <new nickname>\n\nType /help for more.');
  }

  const [oldNickname, newNickname] = args;
  const user = await getOrCreateUser(ctx);
  const result = await renameWallet(user._id, oldNickname.toLowerCase(), newNickname);

  if (result.error) {
    return ctx.reply(result.error);
  }
  ctx.reply(`Renamed "${oldNickname}" to "${newNickname}".`);
});

bot.command('pause', async (ctx) => {
  const nickname = getArgs(ctx)[0];

  if (!nickname) {
    return ctx.reply('Usage: /pause <nickname>\n\nType /help for more.');
  }

  const user = await getOrCreateUser(ctx);
  const result = await setWalletStatus(user._id, nickname.toLowerCase(), 'paused');

  if (result.error) {
    return ctx.reply(result.error);
  }
  ctx.reply(`Paused alerts for "${nickname}".`);
});

bot.command('resume', async (ctx) => {
  const nickname = getArgs(ctx)[0];

  if (!nickname) {
    return ctx.reply('Usage: /resume <nickname>\n\nType /help for more.');
  }

  const user = await getOrCreateUser(ctx);
  const result = await setWalletStatus(user._id, nickname.toLowerCase(), 'active');

  if (result.error) {
    return ctx.reply(result.error);
  }
  ctx.reply(`Resumed alerts for "${nickname}".`);
});

bot.command('list', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const wallets = await listWallets(user._id);

  if (wallets.length === 0) {
    return ctx.reply("You're not tracking any wallets yet — try /track <address> <nickname>");
  }

  // Fetch balances live, in parallel, rather than one at a time.
  const lines = await Promise.all(
    wallets.map(async (w) => {
      const balance = await getSolBalance(w.walletAddress);
      const statusLabel = w.status === 'paused' ? '⏸ paused' : '✓ active';
      return `${w.nickname} — ${w.walletAddress.slice(0, 4)}...${w.walletAddress.slice(-4)} — ${balance.toFixed(2)} SOL — ${statusLabel}`;
    })
  );

  ctx.reply(lines.join('\n'));
});

bot.command('balance', async (ctx) => {
  const nickname = getArgs(ctx)[0];

  if (!nickname) {
    return ctx.reply('Usage: /balance <nickname>\n\nType /help for more.');
  }

  const user = await getOrCreateUser(ctx);
  const wallets = await listWallets(user._id);
  const wallet = wallets.find((w) => w.nicknameLower === nickname.toLowerCase());

  if (!wallet) {
    return ctx.reply(`No wallet named "${nickname}" found.`);
  }

  const balance = await getSolBalance(wallet.walletAddress);
  ctx.reply(`${wallet.nickname}: ${balance.toFixed(4)} SOL`);
});

bot.launch();

// Telegraf's recommended shutdown hooks — stops polling cleanly instead of
// leaving a dangling long-poll request when the process is killed.
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
