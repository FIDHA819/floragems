const User=require("../../models/userschema")
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongodb = require("mongodb");
const Cart=require("../../models/cartSchema")
const mongoose = require("mongoose");
const env = require("dotenv").config();
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const { ObjectId } = mongoose.Types;
const easyinvoice = require("easyinvoice");
const Coupon = require("../../models/couponSchema");
const { productDetails } = require("./productController");


const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.query.userId;

    // Validate userId
    if (!userId || !mongodb.ObjectId.isValid(userId)) {
      return res.redirect("/pageNotFound");
    }

    // Fetch user
    const findUser = await User.findById(userId);
    if (!findUser) {
      return res.redirect("/pageNotFound");
    }

    // Fetch user's address
    const addressData = await Address.findOne({ userId: userId });

    // Fetch cart and populate product details
    const cart = await Cart.findOne({ userId: userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    // Map cart items to a usable format
    const cartItems = cart.items.map((item) => {
      const product = item.productId;
      return {
        productId: product._id,
        productName: product.productName,
        productPrice: product.salePrice,
        quantity: item.quantity,
        total: product.salePrice * item.quantity,
        productImages: product.productImages || [],
        brand: product.brand || "N/A",
        productDetails: product.productDetails,
      };
    });

    // Calculate totals
    const grandTotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = grandTotal > 500 ? 0 : 100;
    const Total = grandTotal + shippingCost;

    // Fetch available coupons
    const today = new Date();
    const findCoupons = await Coupon.find({
      isList: true,
      createdOn: { $lt: today },
      expireOn: { $gt: today },
      minimumPrice: { $lt: grandTotal },
    });

    // Render the checkout page
    res.render("user/checkout-cart", {
      cartItems, // Pass cart items directly
      user: findUser,
      isCart: true,
      userAddress: addressData,
      grandTotal,
      Coupon: findCoupons,
      shippingCost,
      Total
    });
  } catch (error) {
    console.error("Error in getCheckoutPage:", error);
    res.redirect("/pageNotFound");
  }
};


const deleteProduct = async (req, res) => {
  try {
    const productId = req.query.id; // Get the productId from query parameters
    const userId = req.session.user._id; // Get the userId from the session

    console.log("User ID:", userId); // Debugging
    console.log("Product ID:", productId); // Debugging

    // Ensure that userId and productId are valid
    if (!userId || !productId) {
      console.log("Missing userId or productId");
      return res.redirect("/pageNotFound");
    }

    // Find the user's cart
    const cart = await Cart.findOne({ userId: userId });

    if (!cart) {
      console.log("Cart not found for user");
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    // Find the index of the item to remove
    const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId);
    if (itemIndex === -1) {
      console.log("Product not found in cart");
      return res.status(404).json({ success: false, message: "Product not found in cart" });
    }

    // Remove the item from the cart
    cart.items.splice(itemIndex, 1);

    // Save the updated cart
    await cart.save();

    console.log("Product removed successfully");
    res.json({ success: true, message: "Product removed from cart" });
  } catch (error) {
    console.error("Error removing product from cart:", error);
    res.status(500).json({ success: false, message: "Server error while removing product" });
  }
};


const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    const selectedCoupon = await Coupon.findOne({ name: req.body.coupon });

    if (!selectedCoupon) {
      return res.json({ success: false, message: 'Coupon not found' });
    }

    if (selectedCoupon.userId.includes(userId)) {
      return res.json({ success: false, message: 'Coupon already used' });
    }

    await Coupon.updateOne(
      { name: req.body.coupon },
      { $addToSet: { userId: userId } }
    );

    const gt = parseInt(req.body.total) - parseInt(selectedCoupon.offerPrice);
    return res.json({ success: true, gt: gt, offerPrice: parseInt(selectedCoupon.offerPrice) });
  } catch (error) {
    console.error('Error applying coupon:', error);
    return res.json({ success: false, message: 'Error applying coupon' });
  }
};

const orderPlaced = async (req, res) => {
  try {
    const { totalPrice, addressId, payment, discount } = req.body;
    const userId = req.session.user;
    const findUser = await User.findOne({ _id: userId });
    if (!findUser) {
      return res.status(404).json({ error: "User not found" });
    }
    const productIds = findUser.cart.map((item) => item.productId);
    const findAddress = await Address.findOne({ userId: userId, "address._id": addressId });
    if (!findAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    const desiredAddress = findAddress.address.find((item) => item._id.toString() === addressId.toString());
    if (!desiredAddress) {
      return res.status(404).json({ error: "Specific address not found" });
    }
    const findProducts = await Product.find({ _id: { $in: productIds } });
    if (findProducts.length !== productIds.length) {
      return res.status(404).json({ error: "Some products not found" });
    }
    const cartItemQuantities = findUser.cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    const orderedProducts = findProducts.map((item) => ({
      _id: item._id,
      price: item.salePrice,
      name: item.productName,
      image: item.productImage[0],
      productStatus: "Confirmed",
      quantity: cartItemQuantities.find((cartItem) => cartItem.productId.toString() === item._id.toString()).quantity,
    }));

    if (payment === "cod" && totalPrice > 1000) {
      return res.status(400).json({ error: "Orders above ₹1000 are not allowed for Cash on Delivery (COD)" });
    }

    const finalAmount = totalPrice - discount;

    let newOrder = new Order({
      product: orderedProducts,
      totalPrice: totalPrice,
      discount: discount,
      finalAmount: finalAmount,
      address: desiredAddress,
      payment: payment,
      userId: userId,
      status: "Confirmed",
      createdOn: Date.now(),
    });
    let orderDone = await newOrder.save();

    await User.updateOne({ _id: userId }, { $set: { cart: [] } });
    for (let orderedProduct of orderedProducts) {
      const product = await Product.findOne({ _id: orderedProduct._id });
      if (product) {
        product.quantity = Math.max(product.quantity - orderedProduct.quantity, 0);
        await product.save();
      }
    }

    res.json({
      payment: true,
      method: "cod",
      order: orderDone,
      quantity: cartItemQuantities,
      orderId: orderDone._id,
    });

  } catch (error) {
    console.error("Error processing order:", error);
    res.redirect("/pageNotFound");
  }
};

const getOrderDetailsPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.query.id;
    const findOrder = await Order.findOne({ _id: orderId });
    const findUser = await User.findOne({ _id: userId });
    
    let totalGrant = 0;
    findOrder.product.forEach((val) => {
      totalGrant += val.price * val.quantity;
    });

    const totalPrice = findOrder.totalPrice;
    const discount = totalGrant - totalPrice;
    const finalAmount = totalPrice; 

    res.render("orderDetails", {
      orders: findOrder,
      user: findUser,
      totalGrant: totalGrant,
      totalPrice: totalPrice,
      discount: discount,
      finalAmount: finalAmount,
    });
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const paymentConfirm = async (req, res) => {
  try {
    await Order.updateOne(
      { _id: req.body.orderId },
      { $set: { status: "Confirmed" } }
    ).then((data) => {
      res.json({ status: true });
    });
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const findUser = await User.findOne({ _id: userId });
    if (!findUser) {
      return res.status(404).json({ message: "User not found" });
    }
    const { orderId } = req.body;
    const findOrder = await Order.findOne({ _id: orderId });
    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (findOrder.status === "Cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    await Order.updateOne({ _id: orderId }, { status: "Cancelled" });

    for (const productData of findOrder.product) {
      const productId = productData._id;
      const quantity = productData.quantity;
      const product = await Product.findById(productId);
      if (product) {
        product.quantity += quantity;
        await product.save();
      }
    }

    res.status(200).json({ message: "Order cancelled successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const returnorder = async (req, res) => {
  try {
    const userId = req.session.user;
    const findUser = await User.findOne({ _id: userId });
    if (!findUser) {
      return res.status(404).json({ message: "User not found" });
    }
    const { orderId } = req.body;
    const findOrder = await Order.findOne({ _id: orderId });
    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (findOrder.status === "returned") {
      return res.status(400).json({ message: "Order is already returned" });
    }
    await Order.updateOne({ _id: orderId }, { status: "Return Request" });
    res.status(200).json({ message: "Return request initiated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const downloadInvoice = async (req, res) => {
  try {
      const orderId = req.params.orderId;
      const order = await Order.findById(orderId).populate('userId');

      if (!order) {
          return res.status(404).send('Order not found');
      }

      const data = {
          "documentTitle": "INVOICE",
          "currency": "INR",
          "taxNotation": "gst",
          "marginTop": 25,
          "marginRight": 25,
          "marginLeft": 25,
          "marginBottom": 25,
          apiKey: process.env.EASYINVOICE_API,
          mode: "development",
          images: {
              logo: "https://firebasestorage.googleapis.com/v0/b/ecommerce-397a7.appspot.com/o/logo.jpg?alt=media&token=07b6be19-1ce8-4797-a3a0-f0eaeaafedad",
          },
          "sender": {
            "company": "Trend Setter",
            "address": "Thrissur, Kerala",
            "zip": "680007",
            "city": "Thrissur",
            "state": "Kerala",
            "country": "India",
            "email": "trendsetter@trendy.com",
            "phone": "+91 9073470980",
        },
        "client": {
            "company": order.userId.name,
            "address": order.address.street,
            "zip": order.address.zip,
            "city": order.address.city,
            "state": order.address.state,
            "country": order.address.country,
            "email": order.userId.email,
            "phone": order.userId.phone,
        },
        "invoiceNumber": orderId,
        "date": order.createdOn,
        "products": order.product.map(item => ({
            "quantity": item.quantity,
            "description": item.name,
            "price": item.price,
            "tax": 0,
            "total": item.quantity * item.price
        })),
        "bottomNotice": "Thank you for your purchase",
    };

    easyinvoice.createInvoice(data).then(invoice => {
        const pdf = invoice.pdf;
        const filePath = path.join(__dirname, '..', 'downloads', `${orderId}.pdf`);
        fs.writeFileSync(filePath, pdf, 'binary');
        res.download(filePath, `${orderId}.pdf`);
    });
} catch (error) {
    console.error(error);
    res.status(500).send('Error generating invoice');
}
};


const postAddNewAddress = async (req, res) => {
  try {
      const userId = req.session.user;
      if (!userId) {
          console.log("User ID not found in session");
          return res.redirect("/pageNotFound");
      }

      const userData = await User.findOne({ _id: userId });
      if (!userData) {
          console.log("User not found in database with ID:", userId);
          return res.redirect("/pageNotFound");
      }

      const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;

      // Log the received data for debugging
      console.log("Received address data:", req.body);

      const userAddress = await Address.findOne({ userId: userData._id });
      if (!userAddress) {
          const newAddress = new Address({
              userId: userData._id,
              address: [{ addressType, name, city, landMark, state, pincode, phone, altPhone }]
          });
          await newAddress.save();
          console.log("New address added for user:", userData._id);
      } else {
          userAddress.address.push({ addressType, name, city, landMark, state, pincode, phone, altPhone });
          await userAddress.save();
          console.log("Address added to existing address list for user:", userData._id);
      }

      res.redirect("/checkout");
  } catch (error) {
      console.error("Error adding address:", error);
      res.redirect("/pageNotFound");
  }
};

const addNewaddress = async (req, res) => {
  try {
      const user = req.session.user;
      if (!user) {
          console.log("User not found in session");
          return res.redirect("/pageNotFound");
      }
      res.render("user/add-address", { user: user });
  } catch (error) {
      console.error("Error rendering add address page:", error);
      res.redirect("/pageNotFound");
  }
};

module.exports = {
getCheckoutPage,
deleteProduct,
applyCoupon,
orderPlaced,
getOrderDetailsPage,
cancelOrder,
returnorder,
paymentConfirm,
downloadInvoice,
postAddNewAddress,
addNewaddress
};