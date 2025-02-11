const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userschema");
const productDetails = async (req, res) => {
  try {
    const userId = req.session.User;
    const userData = await User.findById(userId);
    const productId = req.query.id;

    if (!productId) {
      return res.redirect("/error?message=Product ID is required");
    }

    const product = await Product.findById(productId).populate("category");
console.log(product.category)

    if (!product || product.isBlocked) {
      return res.redirect("/pageNotFound?message=Product not found or unavailable");
    }


    if (product.category && product.category.isListed==false) {
      return res.redirect("/pageNotFound?message=Product category is unlisted");
    }

    // Fetch top-selling products
    const topSellingProducts = await Product.find({ isBlocked: false }).sort({ salesCount: -1 }).limit(6);

    const findCategory = product?.category;
    const categoryOffer = findCategory?.categoryOffer || 0;
    const productOffer = product.productOffer || 0;
    const totalOffer = categoryOffer + productOffer;

    res.render("user/details", {
      user: userData,
      product: product,
      quantity: product.quantity,
      category: findCategory,
      totalOffer: totalOffer,
      topSellingProducts: topSellingProducts,
      validUntil: product.validUntil || null,
      offerType: product.offerType || "percentage",
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.redirect("/error?message=An unexpected error occurred");
  }
};

module.exports = {
  productDetails,
};
