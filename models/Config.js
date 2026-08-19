const mongoose = require('mongoose');

// A single-document collection for app-wide settings that need to survive
// restarts. Right now this only stores the Helius webhook's ID, since we
// create it once and then update it, rather than creating a new one per wallet.
const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String },
});

module.exports = mongoose.model('Config', configSchema);