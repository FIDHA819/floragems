const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../../models/userschema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const getCartPage = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.render("user/cartPage", {
        user,
        quantity: 0,
        cartItems: [],
        subtotal: 0,
        grandTotal: 0,
        shippingCost: 0,
      });
    }

    const cartItems = cart.items.map((cartItem) => {
      const product = cartItem.productId;
      if (!product) return null;

      const availableStockMessage = product.quantity < cartItem.quantity ? 
        `Only ${product.quantity} items available` : "";

      return {
        productId: product._id,
        productName: product.productName,
        productPrice: product.salePrice,
        quantity: cartItem.quantity,
        total: product.salePrice * cartItem.quantity,
        productImages: product.productImages,
        brand: product.brand || "N/A",
        availableStockMessage,
      };
    }).filter(Boolean);

    const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = subtotal > 1000 ? 0 : 100;
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

//delete product from cart

const deleteProduct = async (req, res) => {
  try {
    const productId = req.query.id; 
    const userId = req.session?.user?._id; 
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


//check stock availability
    
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



///add to cart

const addToCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ redirectToLogin: true });
    }

    const { productId, quantity } = req.body;
    const userId = req.session?.user?._id;

    if (!userId || !ObjectId.isValid(productId)) {
      return res.status(400).json({ status: "Invalid request" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ status: "Product not found" });
    }

    // Check if requested quantity is greater than available stock
    if (product.quantity < quantity) {
      return res.status(400).json({ status: "Insufficient stock", message: `Only ${product.quantity} items available in stock` });
    }

    const user = await User.findById(userId);
    const maxQuantity = 3;
    const quantityToAdd = Math.min(quantity, maxQuantity);

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId);

    if (itemIndex > -1) {
      const cartItem = cart.items[itemIndex];
      const newQuantity = cartItem.quantity + quantityToAdd;

      //for a product only 3 can be ordered once 
      if (newQuantity > maxQuantity) {
        return res.status(400).json({
          status: "Quantity limit exceeded",
          message: "You can only add a maximum of 3 of this product to your cart.",
        });
      }

      cartItem.quantity = newQuantity;
      cartItem.totalPrice = cartItem.price * cartItem.quantity;
    } else {
      cart.items.push({
        productId: new ObjectId(productId),
        quantity: quantityToAdd,
        price: product.salePrice,
        totalPrice: product.salePrice * quantityToAdd,
      });
    }

    await cart.save();
    user.cart = cart.items;
    await user.save();

    res.json({
      status: true,
      cartLength: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: cart.items.reduce((sum, item) => sum + item.totalPrice, 0),
    });
  } catch (error) {
    console.error("Error in addToCart:", error);
    res.status(500).json({ status: false, error: "Internal server error" });
  }
};

//change quantity 
const changeQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const user = await User.findById(req.session.user._id);
    const product = await Product.findById(productId);

    const cart = await Cart.findOne({ userId: user._id });
    const cartItem = cart.items.find(item => item.productId.toString() === productId);

    if (!cartItem) {
      return res.status(404).json({ error: 'Product not found in cart' });
    }

    // Check if the  quantity is available or not in the  in stock
    if (parsedQuantity > product.quantity) {
      return res.status(400).json({ 
        error: 'Stock has been changed', 
        message: `We only have ${product.quantity} items in stock. Please adjust your quantity.`
      });
    }

    cartItem.quantity = parsedQuantity;
    cartItem.totalPrice = cartItem.price * cartItem.quantity;

    await cart.save();

    const grandTotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

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
    const userId = req.session.user._id; 
    const cart = await Cart.findOne({ userId: userId }); 

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    // Calculate the total number of items in the cart
    const totalProductsInCart = cart.items.reduce((total, item) => total + item.quantity, 0);

    
    res.json({ cartLength: totalProductsInCart });
  } catch (error) {
    console.error('Error fetching cart count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
const clearCart = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }


    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    
    cart.items = [];
    await cart.save(); 

    res.json({ success: true, message: "Cart cleared successfully" });
  } catch (error) {
    console.error("Error in clearCart:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


module.exports = {
  getCartPage,
  addToCart,
  changeQuantity,
  deleteProduct,
  getCheckStock,
  getCartCount,
  clearCart
};
