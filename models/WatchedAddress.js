const mongoose = require('mongoose');

const watchedAddressSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  // How many users currently have this address active.
  // 0 -> 1 means "register with Helius". 1 -> 0 means "unregister".
  trackerCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('WatchedAddress', watchedAddressSchema);