const mongoose = require("mongoose");
const { Schema } = mongoose;

const bannerSchema = new Schema({
  imageUrl: {
    type: String,
    required: true, // URL or path to the image
  },
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true, // Whether the banner is active or not
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Banner = mongoose.model("Banner", bannerSchema);
module.exports = Banner;
