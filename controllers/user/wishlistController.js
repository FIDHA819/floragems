const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../../models/userschema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");

const loadwishlistPage = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const products=await Product.find({_id:{$in:user.wishlist}}).populate("category")
res.render("user/wishlist",{
    user,
    wishlist:products
})


} catch (error) {
    console.error("Error in wishlist:", error);
    res.redirect("/pageNotFound");
  }
};

const addToWishlist = async (req, res) => {
  try {
      const productId = req.body.productId;
      const userId = req.session?.userId || req.user?.id; // Corrected variable name

      if (!userId) {
          return res.status(401).json({ error: 'User not authenticated' });
      }

      // Fetch the user from the database
      const user = await User.findById(userId);

      // Check if the product is already in the wishlist
      if (user.wishlist.includes(productId)) {
          return res.status(200).json({ status: 'already', message: "Product already in wishlist" });
      }

      // Add the product to the wishlist
      user.wishlist.push(productId);
      await user.save();

      return res.status(200).json({ status: 'added', message: "Product added to wishlist" });
  } catch (error) {
      console.error("Error in addToWishlist:", error);
      return res.status(500).json({ status: 'error', message: "Server error" });
  }
};


const removeProduct=async(req,res)=>{
  try {
    const productId=req.query.productId;
    const userid = req.session?.userId || req.user?.id;

    if (!userid) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const user=await User.findById(userid);
    const index=user.wishlist.indexOf(productId);
    user.wishlist.splice(index,1);
    await user.save()
    return res.redirect("/wishlist")
  } catch (error) {
    console.error(error);
    return res.status(500).json({status:false,message:"Server error"})
    
  }
}

module.exports={
    loadwishlistPage,
    addToWishlist,
    removeProduct
}