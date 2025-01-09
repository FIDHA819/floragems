const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        
          productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
        
        quantity: {
          type: Number,
          default: 1,
          min: [1, "Quantity must be at least 1"],
        },
        price: {
          type: Number,
          required: true,
        },
        totalPrice: {
          type: Number,
          required: true,
          default: function () {
            return this.price * this.quantity;
          },
        },
        status: {
          type: String,
          enum: ["placed", "shipped", "delivered", "cancelled"],
          default: "placed",
        },
        cancellationReason: {
          type: String,
          default: "none",
        },
        image: { // New field for storing the product image URL or path
          type: String,
          required: false,
        },
      },
    ],
  },
  { timestamps: true }
);

// Ensure the totalPrice is calculated when saving
cartSchema.pre("save", function (next) {
  this.items.forEach((item) => {
    if (!item.totalPrice) {
      item.totalPrice = item.price * item.quantity;
    }
  });
  next();
});

// Index to quickly find a cart by userId
cartSchema.index({ userId: 1 });

const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;
