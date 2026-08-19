const mongoose = require('mongoose');

// A sub-schema for the safety check fields, embedded inside each buy event.
// Each field defaults to null, which your alert formatter should read as
// "Unknown" / "Not checked" — never treat a missing check as automatically safe.
const safetyCheckSchema = new mongoose.Schema({
  canDrain: { type: Boolean, default: null },
  isHoneypot: { type: Boolean, default: null },
  liquidityOk: { type: Boolean, default: null },
  holderCount: { type: Number, default: null },
  topHolderPct: { type: Number, default: null },
  tokenAgeHours: { type: Number, default: null },
}, { _id: false }); // _id: false since this is just an embedded object, not its own collection

const eventSchema = new mongoose.Schema({
  address: { type: String, required: true },
  type: { type: String, enum: ['buy', 'sell'], required: true },
  tokenMint: { type: String, required: true },
  tokenName: { type: String },
  amountSol: { type: Number },
  amountUsd: { type: Number },
  priceAtEvent: { type: Number },
  liquidity: { type: Number },
  fiveMinChange: { type: Number },

  safetyCheck: { type: safetyCheckSchema },  
  isFullExit: { type: Boolean },             
  gainLossPct: { type: Number, default: null }, 


  txSignature: { type: String, required: true, unique: true },

  status: {
    type: String,
    enum: ['received', 'enriched', 'delivered', 'failed_enrichment', 'failed_delivery'],
    default: 'received',
  },

  timestamp: { type: Date, required: true }, 
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);