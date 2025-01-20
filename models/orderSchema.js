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
    paymentMethod: {
      type: String,
      required: true,
      enum:[
        "razorpay",
        "cod",
        "wallet"
      ] // Payment method (e.g., 'COD', 'Credit Card')
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: [
        "Pending",   // Payment is not yet completed
        "Paid",      // Payment has been completed
        "Failed",    // Payment failed
        "Refunded",
        "Confirmed" ,
        "Cancelled", // Payment was refunded
        "Refund Processing"
      ], // Enum for payment status
      default: "Pending", // Default payment status
    },
    orderStatus: {
      type: String,
      required: true,
      enum: [
        "Pending",   // Order is placed but not processed yet
        "Processing", // Order is being processed
        "Shipped",    // Order is shipped
        "Delivered",  // Order has been delivered
        "Cancelled",  // Order has been cancelled
        "Return Request", // Order has a return request
        "Returned", 
        "Refund Request",
        "Return Request"  ,
        "Return Pending",
        "rejected",
        "Return Failed",
        "Return Processing"
        // Order has been returned
      ], // Enum for order status (shipping or fulfillment status)
      default: "Pending", // Default order status
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
    couponName: {
      type: String, // Store the coupon name (if applied)
    },
  },
  { timestamps: true } // Automatically add `createdAt` and `updatedAt`
);

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
