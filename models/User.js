const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // This IS the identity — Telegram already gives every user a unique ID,
  // so there's no separate signup/password system to build.
  telegramId: { type: String, required: true, unique: true },
  username: { type: String },   // their @handle, optional
  firstName: { type: String },  // used for a friendlier welcome message
}, { timestamps: true }); // timestamps: true auto-adds createdAt/updatedAt

module.exports = mongoose.model('User', userSchema);