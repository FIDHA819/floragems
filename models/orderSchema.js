const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema(
  {
    orderId: { 
      type: String, 
      required: true, 
      default: () => uuidv4(), 
      unique: true 
    },
    razorpayOrderId: { 
      type: String, 
      unique: true, 
      sparse: true 
    }, 
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    }, 
    totalPrice: { 
      type: Number, 
      required: true 
    },
    discount: { 
      type: Number, 
      default: 0 
    }, 
    finalAmount: { 
      type: Number, 
      required: true 
    },
    refundAmount: { 
      type: Number, 
      default: 0 
    }, 
    cancellationReason: { 
      type: String, 
      default: null 
    },
    returnReason: { 
      type: String, 
      default: null 
    }, 
    orderedItems: [
      {
        product: { 
          type: mongoose.Schema.Types.ObjectId, 
          ref: "Product", 
          required: true 
        }, 
        quantity: { 
          type: Number, 
          required: true 
        }, 
        price: { 
          type: Number, 
          required: true 
        }, 
        total: { 
          type: Number, 
          required: true 
        }, 
        status: {
          type: String,
          enum: [
            "Pending", 
            "Processing", 
            "Cancelled", 
            "Delivered", 
            "Return Requested", 
            "Returned",
            "Shipped", 
            "Refund Requested", 
            "Return Pending", 
            "Rejected", 
            "Return Failed", 
            "Return Processing"
          ],
          default: "Pending",
        },
        paymentStatus: {
          type: String,
          enum: [
            "Pending", 
            "Paid", 
            "Refunded", 
            "Failed", 
            "Confirmed",
            "Partial Refund Processing"
          ],
          default: "Pending",
        }, 
        cancellationReason: { 
          type: String,
          default:null,
        }, 
        returnReason: { 
          type: String, 
          default: null 
        }, 
      },
    ],
    paymentMethod: { 
      type: String, 
      required: true, 
      enum: ["razorpay", "cod", "wallet"] 
    }, 
    paymentStatus: {
      type: String,
      required: true,
      enum: [
        "Pending", 
        "Paid", 
        "Failed", 
        "Refunded", 
        "Confirmed", 
        "Refund Processing", 
        "Partial Refund Processing"
      ],
      default: "Pending",
    },
    orderStatus: {
      type: String,
      required: true,
      enum: [
        "Pending", 
        "Processing", 
        "Shipped", 
        "Delivered", 
        "Cancelled", 
        "Return Requested", 
        "Returned", 
        "Refund Requested", 
        "Return Pending", 
        "Rejected", 
        "Return Failed", 
        "Return Processing"
      ],
      default: "Pending",
    }, 
    address: {
      addressType: { 
        type: String 
      },
      name: { 
        type: String 
      },
      landMark: { 
        type: String 
      }, 
      city: { 
        type: String 
      }, 
      state: { 
        type: String 
      }, 
      pincode: { 
        type: String 
      },
      phone: { 
        type: String 
      }, 
    }, 
    createdAt: { 
      type: Date, 
      default: Date.now 
    }, 
    updatedAt: { 
      type: Date, 
      default: Date.now 
    }, 
  },
  { timestamps: true } 
);

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
