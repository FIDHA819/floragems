const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userschema");

const productDetails = async (req, res) => {
  try {
    const userId = req.session.User;
    const userData = await User.findById(userId);
    const products = await Product.find(); 
    const productId = req.query.id;
    if (!productId) {
      return res.status(400).send("Product ID is required.");
    }

    const product = await Product.findById(productId).populate("category");
    if (!product) {
      return res.status(404).send("Product not found.");
    }

    const findCategory = product?.category;
    const categoryOffer = findCategory?.categoryOffer || 0;
    const productOffer = product.productOffer || 0;
    const totalOffer = categoryOffer + productOffer;

    res.render("user/details", {
      user: userData,
      product: product,
      quantity:product.quantity,
      category:findCategory,

      totalOffer: totalOffer,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.status(500).send("An error occurred while fetching product details.");
  }
};

module.exports = {
  productDetails,
};
