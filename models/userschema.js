const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    sparse:true,
  },
  phone: {
    type: String,
    required: false,
    unique: false,
    sparse: true,
    default: null,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  cart: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
    },
  ],
  wallet: {
    type: Number,
    default: 0,
  },
  wishlist: [
    {
      type: Schema.Types.ObjectId,
      ref: "wishlist",
    },
  ],
  orderHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
  ],
  createdOn: {
    type: Date,
    default: Date.now,
  },
  referralCode: {
    type: String,
    unique: true,
    required: true,  // Ensure that referralCode is always required
  },
  redeemedUsers: [{
    userName: String,
    signupDate: { type: Date, default: Date.now },
    reward: Number,
  }],
  searchHistory: [
    {
      category: {
        type: Schema.Types.ObjectId,
        ref: "category",
      },
      brand: {
        type: String,
      },
      searchOn: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

// Middleware to generate a unique referral code
userSchema.pre("save", async function (next) {
  if (!this.referralCode) {
    try {
      // Generate referral code from the last 6 characters of the user _id
      this.referralCode = this._id.toString().slice(-6).toUpperCase();

      // Check if the referral code already exists
      const existingUser = await mongoose.model("User").findOne({ referralCode: this.referralCode });
      if (existingUser) {
        // If referral code exists, generate a new one using a different slice
        this.referralCode = this._id.toString().slice(-8, -2).toUpperCase();
      }
    } catch (error) {
      console.error("Error generating referral code:", error);
    }
  }
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
