const mongoose = require('mongoose');

const trackedWalletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  walletAddress: { type: String, required: true },
  nickname: { type: String, required: true },       // shown to the user, keeps original casing
  nicknameLower: { type: String, required: true },   // used for case-insensitive matching/uniqueness
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
}, { timestamps: true });

// Enforces: no duplicate wallet address per user
trackedWalletSchema.index({ userId: 1, walletAddress: 1 }, { unique: true });
// Enforces: no duplicate nickname per user, case-insensitive
trackedWalletSchema.index({ userId: 1, nicknameLower: 1 }, { unique: true });

// Automatically keep nicknameLower in sync with nickname whenever a document is saved,
// so you never have to remember to set it manually in your route handlers.
trackedWalletSchema.pre('save', function () {
  this.nicknameLower = this.nickname.toLowerCase();
});

module.exports = mongoose.model('TrackedWallet', trackedWalletSchema);