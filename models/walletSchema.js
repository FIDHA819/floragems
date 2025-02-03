const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletTransactionSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Index for faster lookups
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount must be a positive number"], // Ensure positive amounts
    },
    type: {
      type: String,
      enum: ["Credit", "Debit"],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Success", "Pending", "Failed"],
      default: "Success",
    },
    source: {
      type: String,
      enum: ["Referral", "Purchase", "Refund", "Other"],
      default: "Other",
    },
  },
  { timestamps: true }
);

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
module.exports = WalletTransaction;
