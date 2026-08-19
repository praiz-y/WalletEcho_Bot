// Load environment variables from .env into process.env
require('dotenv').config();
const connectDB = require('./db');
connectDB();

require('./bot');
console.log('Telegram bot started (polling)');

const express = require('express');
const app = express();

// Middleware to parse JSON bodies (needed later for the Helius webhook)
app.use(express.json());

const webhookRouter = require('./routes/webhook');
app.use('/', webhookRouter);

// Simple health check route.
// This is what confirms the server is alive, and what the keep-alive
// ping (UptimeRobot / cron-job.org / GitHub Actions) will hit every
// ~10-14 minutes to stop Render's free tier from sleeping.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Render sets PORT itself and expects the app to listen on it.
// The "|| 3000" fallback is just for running locally on your own machine.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`WalletEcho server running on port ${PORT}`);
});