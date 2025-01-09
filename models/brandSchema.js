

const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema(
  {
    brandName: {
      type: String,
      required: true,
      unique: true,
    },
    brandImage: {
      type:[String],
      required: true,
    },
    isBlocked:{
        type:Boolean,
        default:false
    },
    createdAt:{
        type:Date,
        default:Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Brand", brandSchema);
