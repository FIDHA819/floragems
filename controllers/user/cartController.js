const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../../models/userschema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");

const getCartPage = async (req, res) => {
  try {
    const userId = req.session?.user?._id; // Get user ID from session
    if (!ObjectId.isValid(userId)) {
      return res.status(400).send("Invalid user ID");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const cart = await Cart.findOne({ userId: userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.render("user/cartPage", {
        user,
        quantity: 0,
        cartItems: [],
        grandTotal: 0,
        shippingCost: 0,
      });
    }

    const cartItems = cart.items.map((cartItem) => {
      const product = cartItem.productId;
      if (!product) return null;

      return {
        productId: product._id,
        productName: product.productName,
        productPrice: product.salePrice,
        quantity: cartItem.quantity,
        total: product.salePrice * cartItem.quantity,
        productImages: product.productImages,
        brand: product.brand || "N/A",
      };
    }).filter(Boolean);

    const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = subtotal > 500 ? 0 : 100;
    const grandTotal = subtotal + shippingCost;

    res.render("user/cartPage", {
      user,
      quantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      cartItems,
      subtotal,
      grandTotal,
      shippingCost,
    });
  } catch (error) {
    console.error("Error in getCartPage:", error);
    res.redirect("/pageNotFound");
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.session?.user?._id;

    if (!userId || !ObjectId.isValid(productId)) {
      return res.status(400).json({ status: "Invalid request" });
    }

    const product = await Product.findById(productId);
    if (!product || product.quantity < quantity) {
      return res.status(400).json({ status: "Insufficient stock" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId);
    if (itemIndex > -1) {
      const cartItem = cart.items[itemIndex];
      if (cartItem.quantity + quantity <= product.quantity) {
        cartItem.quantity += quantity;
        cartItem.totalPrice = cartItem.price * cartItem.quantity;
      } else {
        return res.status(400).json({ status: "Exceeds available stock" });
      }
    } else {
      cart.items.push({
        productId: new ObjectId(productId),
        quantity,
        price: product.salePrice,
        totalPrice: product.salePrice * quantity,
      });
    }

    await cart.save();
    res.json({ status: true, cartLength: cart.items.reduce((sum, item) => sum + item.quantity, 0) });
  } catch (error) {
    console.error("Error in addToCart:", error);
    res.status(500).json({ status: false, error: "Internal server error" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.query.id; // Get the productId from query parameters
    const userId = req.session?.user?._id; // Get the userId from the session
    console.log("from backen:",productId)

    if (!ObjectId.isValid(userId) || !ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid request parameters" });
    }

    // Find the user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    // Find the index of the item to remove
    const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: "Product not found in cart" });
    }

    // Remove the item from the cart
    cart.items.splice(itemIndex, 1);
    await cart.save();

    res.json({ success: true, message: "Product removed from cart" });
  } catch (error) {
    console.error("Error in deleteProduct:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

    

const getCheckStock = async (req, res) => {
  try {
    const { productId } = req.query;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ availableStock: product.quantity || 0 });
  } catch (error) {
    console.error("Error in getCheckStock:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



const changeQuantity = async (req, res) => {
  try {
      const { productId, quantity } = req.body;

      // Validate quantity
      const parsedQuantity = parseInt(quantity, 10);
      if (isNaN(parsedQuantity) || parsedQuantity < 1) {
          return res.status(400).json({ error: 'Invalid quantity' });
      }

      const user = await User.findById(req.session.user._id);
      const product = await Product.findById(productId);

      // Check if the product exists and is in the cart
      const cart = await Cart.findOne({ userId: user._id });
      const cartItem = cart.items.find(item => item.productId.toString() === productId);

      if (!cartItem) {
          return res.status(404).json({ error: 'Product not found in cart' });
      }

      // Update the quantity
      cartItem.quantity = parsedQuantity;
      cartItem.totalPrice = cartItem.price * cartItem.quantity; // Update total price

      await cart.save();

      // Recalculate the grand total
      const grandTotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

      // Send the updated subtotal and grand total
      res.status(200).json({
          message: 'Quantity updated successfully',
          newSubtotal: cartItem.totalPrice,
          newGrandTotal: grandTotal
      });
  } catch (error) {
      console.error('Error updating quantity:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
};






const getCartCount = async (req, res) => {
  try {
    const userId = req.session.user._id; // Get the user ID from session
    const cart = await Cart.findOne({ userId: userId }); // Find the user's cart

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    // Calculate the total number of items in the cart
    const totalProductsInCart = cart.items.reduce((total, item) => total + item.quantity, 0);

    // Send the cart length (total number of products) as a response
    res.json({ cartLength: totalProductsInCart });
  } catch (error) {
    console.error('Error fetching cart count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getCartPage,
  addToCart,
  changeQuantity,
  deleteProduct,
  getCheckStock,
  getCartCount,
};
