const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      required: true,
      default: () => uuidv4(),
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // Reference to User model
    },
    totalPrice: {
      type: Number,
      required: true, // Total price of the order
    },
    discount: {
      type: Number,
      default: 0, // Discount applied to the order
    },
    finalAmount: {
      type: Number,
      required: true, // Final amount after discount
    },
    orderedItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product", // Reference to Product model
          required: true,
        },
        quantity: {
          type: Number,
          required: true, // Quantity of the product
        },
        price: {
          type: Number,
          required: true, // Price of the product
        },
        total: {
          type: Number,
          required: true, // Total price for this item (price * quantity)
        },
      },
    ],
    payment: {
      type: String,
      required: true, // Payment method (e.g., 'COD', 'Credit Card')
    },
    status: {
      type: String,
      required: true,
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Return Request",
        "Returned",
      ], // Enum for order status
    },
    address: {
      addressType: { type: String, required: true },
      name: { type: String, required: true },
      city: { type: String, required: true },
      landMark: { type: String },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      phone: { type: String, required: true },
      altPhone: { type: String },
    }, // Embedded address details
    invoiceDate: {
      type: Date,
      default: Date.now, // Default to current date
    },
    couponApplied: {
      type: Boolean,
      default: false, // Indicates if a coupon was applied
    },
  },
  { timestamps: true } // Automatically add `createdAt` and `updatedAt`
);

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
