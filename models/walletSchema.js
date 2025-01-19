const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletTransactionSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
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
    source: { type: String, enum: ["Referral", "Purchase", "Refund", "Other"], default: "Other" },
  },
  { timestamps: true }
);

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
module.exports = WalletTransaction;
