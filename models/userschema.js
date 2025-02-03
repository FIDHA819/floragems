const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true, // Removes extra spaces
  },
  email: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
    match: [/^\S+@\S+\.\S+$/, "Invalid email format"], // Email validation
  },
  phone: {
    type: String,
    unique: false,
    sparse: true,
    default: null,
    match: [/^\d{10}$/, "Invalid phone number format"], // 10-digit phone number
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
    min: [0, "Wallet balance cannot be negative"], // Ensure non-negative balance
  },
  wishlist: [
    {
      type: Schema.Types.ObjectId,
      ref: "wishlist",
      default: [],
    },
  ],
  orderHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: [],
    },
  ],
  createdOn: {
    type: Date,
    default: Date.now,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  redeemedUsers: [
    {
      userName: String,
      signupDate: { type: Date, default: Date.now },
      reward: Number,
    },
  ],
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
      let unique = false;
      let attempt = 0;

      while (!unique && attempt < 5) { // Retry mechanism for uniqueness
        this.referralCode = this._id.toString().slice(-6).toUpperCase();
        const existingUser = await mongoose.model("User").findOne({ referralCode: this.referralCode });
        if (!existingUser) {
          unique = true;
        } else {
          attempt++;
        }
      }

      if (!unique) {
        throw new Error("Failed to generate unique referral code after multiple attempts.");
      }
    } catch (error) {
      console.error("Error generating referral code:", error);
      return next(error); // Pass error to the next middleware
    }
  }
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
