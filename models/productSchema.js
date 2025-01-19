const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: false,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    regularPrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    productOffer: {
      type: Number,
      default: 0,
    },
    offerType: {
      type: String,
      enum: ["percentage", "flat"], // Add more types if needed
      default: "percentage",
    },
    validUntil: {
      type: Date, // Date field for offer expiration
      required: false,
    },
    quantity: {
      type: Number,
      required: true,
    },
    metalType: {
      type: String,
      enum: ["Gold", "Diamond", "Silver", "Platinum", "Other"],
      required: true,
    },
    productImages: {
      type: [String],
      required: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Available", "Out of stock", "Discount"],
      required: true,
      default: "Available",
    },
  },
  { timestamps: true }
);

// Create a text index on productName and description fields
productSchema.index({ productName: "text", description: "text" });

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
