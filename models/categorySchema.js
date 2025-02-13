const mongoose=require("mongoose");
const{Schema} =  mongoose;
const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    categoryImage: {
        type:[String],
        required: true,
      },
    description: {
        type: String,
        required: true,
    },
    isListed: {
        type: Boolean,
        default: true,
    },
    categoryOffer: {
        type: Number,
        default: 0,
    },
    offerType: {
        type: String,
        enum: ["percentage", "flat"],
        default: "percentage",
    },
    validUntil: {
        type: Date,
        required: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
