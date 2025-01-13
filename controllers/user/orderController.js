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
const { v4: uuidv4 } = require('uuid');
const getCheckoutPage = async (req, res) => {
  try {
    const orderId = uuidv4();
    const userId = req.query.userId;

    if (!userId || !ObjectId.isValid(userId)) {
      return res.redirect("/pageNotFound");
    }

    const findUser = await User.findById(userId);
    if (!findUser) {
      return res.redirect("/pageNotFound");
    }

    const addressData = await Address.findOne({ userId: userId });
    const cart = await Cart.findOne({ userId: userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

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
        availableStock: product.quantity, // Add available stock to check during checkout
      };
    });

    // Check if there is enough stock for each product
    const outOfStockItems = cartItems.filter(item => item.quantity > item.availableStock);
    if (outOfStockItems.length > 0) {
      const outOfStockProductNames = outOfStockItems.map(item => item.productName).join(", ");
      return res.render("user/checkout-cart", {
        user: findUser,
        isCart: true,
        errorMessage: `The following products are out of stock or have insufficient quantity: ${outOfStockProductNames}. Please adjust your cart.`,
        cartItems,
        userAddress: addressData,
        orderId,
        grandTotal: 0,
        shippingCost: 0,
        Total: 0,
      });
    }

    // Calculate totals
    const grandTotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = grandTotal > 50000 ? 0 : 100;
    const Total = grandTotal + shippingCost;

    const today = new Date();
    const findCoupons = await Coupon.find({
      isList: true,
      createdOn: { $lt: today },
      expireOn: { $gt: today },
      minimumPrice: { $lt: grandTotal },
    });

    res.render("user/checkout-cart", {
      cartItems,
      user: findUser,
      orderId: orderId,
      isCart: true,
      userAddress: addressData,
      grandTotal,
      Coupon: findCoupons,
      shippingCost,
      Total,
    });
  } catch (error) {
    console.error("Error in getCheckoutPage:", error);
    res.redirect("/pageNotFound");
  }
};

const orderPlaced = async (req, res) => {
  try {
    const { userId, addressId, totalPrice, discount, payment, orderedItems } = req.body;

    // Fetch the address details from the Address model
    const userAddress = await Address.findOne({ userId });
    if (!userAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    const specificAddress = userAddress.address.find((addr) => addr._id.toString() === addressId);
    if (!specificAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Check if products are available in stock
    for (const item of orderedItems) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ error: `Product not found for ID: ${item.product}` });
      }

      if (product.quantity < item.quantity) {  // Check against 'quantity' field
        return res.status(400).json({ error: `Insufficient stock for product: ${product.productName}` });
      }
    }

    // Create a new order
    const order = new Order({
      userId,
      totalPrice,
      discount,
      finalAmount: totalPrice - discount,
      payment,
      orderedItems: orderedItems.map((item) => ({
        product: item.product,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      })),
      address: specificAddress, // Save the address details here
      status: "Pending",
    });
    
    console.log("New Order ID:", order.orderId);
    
    await order.save();

    // Reduce product quantities after order is placed
    for (const item of orderedItems) {
      const product = await Product.findById(item.product);
      if (product) {
        product.quantity -= item.quantity; // Reduce the 'quantity' field
        await product.save(); // Save the updated product
      }
    }

    res.status(201).json({ message: "Order placed successfully", orderId: order.orderId, order });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


const getOrderDetailsPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.query.id;

    console.log("User ID:", userId);
    console.log("Order ID being queried:", orderId);
    console.log("Order ID being queried:", req.query.id);


    if (!userId || !orderId) {
      return res.status(400).json({ error: "Missing userId or orderId" });
    }

    // Fetch the order by orderId
    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product") // Populate product details
      .exec();

    console.log("Fetched Order Data:", findOrder);

    if (!findOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Address is directly embedded in the order document
    const specificAddress = findOrder.address;

    console.log("Specific Address:", specificAddress);
    console.log("Specific Address passed to frontend:", specificAddress);

    const findUser = await User.findOne({ _id: userId });

    if (!findUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!findOrder.orderedItems || !Array.isArray(findOrder.orderedItems)) {
      return res.status(400).json({ error: "Invalid order products data" });
    }

    let totalGrant = 0;
    findOrder.orderedItems.forEach((item) => {
      totalGrant += item.price * item.quantity;
    });

    const totalPrice = findOrder.totalPrice;
    const discount = totalGrant - totalPrice;
    const finalAmount = totalPrice;

    console.log("Total Grant: ", totalGrant);
    console.log("Total Price: ", totalPrice);
    console.log("Discount: ", discount);
    console.log("Final Amount: ", finalAmount);
    console.log("Address passed to template:", findOrder.address);

    res.render("user/orderDetails", {
      orders: findOrder,
      user: findUser,
      address: findOrder.address,  // Pass the embedded address to the template
      totalGrant: totalGrant,
      totalPrice: totalPrice,
      discount: discount,
      finalAmount: finalAmount,
      response:res
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
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



const cancelOrder = async (req, res) => {
  try {
      const { orderId ,reason} = req.body;

      

      // Find the order by orderId (not _id)
      const findOrder = await Order.findOne({ orderId })
          .populate("orderedItems.product") // Populate product details
          .exec();

      if (!findOrder) {
          return res.status(404).json({ message: "Order not found" });
      }

      // Check if the order is already cancelled
      if (findOrder.status === "Cancelled") {
          return res.status(400).json({ message: "Order is already cancelled" });
      }

      // Update order status to "Cancelled"
      await Order.updateOne({ orderId }, { status: "Cancelled" });
      findOrder.cancellationReason = reason;  // Save the reason in the order document
        findOrder.status = 'Cancelled';  // Update the status to 'Cancelled'
        await findOrder.save();


      // Loop through the products and update their quantities
      for (const productData of findOrder.orderedItems) {
          const productId = productData.product._id;
          const quantity = productData.quantity;

          const product = await Product.findById(productId);
          if (product) {
              product.quantity += quantity;
              await product.save();
          }
      }

      // Send success response
      res.status(200).json({ message: "Order cancelled successfully" });

  } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error" });
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


const listMyorders=async(req,res)=>{
  
    const userId = req.session.user;
    const orders = await Order.find({ userId: req.session.user}) // Fetch orders for the logged-in user
        .populate('orderedItems.product') // Populate product data
        .sort({ createdAt: -1 }); // Sort by creation date (latest first)

        const page = parseInt(req.query.page) || 1;
        const limit = 2;  // Orders per page
        const skip = (page - 1) * limit;

    try {
      const orders = await Order.find({ userId })
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 });  // Sort orders by date, latest first
      const totalOrders = await Order.countDocuments({ userId });
    res.render('user/myOrder', { orders  ,  totalPages: Math.ceil(totalOrders / limit),
      currentPage: page,}); // Render myOrders.ejs and pass the orders data
} catch (error) {
    console.error(error);
    res.status(500).send('Error fetching orders');
}
}
const getOrderDetailsPages = async (req, res) => {
  try {
    const orderId = req.params.orderId; // Retrieve the orderId from the URL
    console.log("Order ID being queried:", orderId); // Log the orderId to verify it's correct

    // Fetch the order with populated ordered items
    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product") // Populate product details
      .exec();

    console.log("Fetched Order Data:", findOrder);

    if (!findOrder) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    // Calculate the total grant
    let totalGrant = 0;
    findOrder.orderedItems.forEach((item) => {
      totalGrant += item.price * item.quantity;
    });

    const totalPrice = findOrder.totalPrice;
    const discount = totalGrant - totalPrice;
    const finalAmount = totalPrice;

    // Pass 'findOrder.address' directly to the view
    res.render('user/orderDetails', {
      orders: findOrder,
      address: findOrder.address, // Directly use the embedded address
      totalGrant: totalGrant,
      totalPrice: totalPrice,
      discount: discount,
      finalAmount: finalAmount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: 'An error occurred while fetching the order details' });
  }
};



module.exports = {
getCheckoutPage,
deleteProduct,
listMyorders,
orderPlaced,
getOrderDetailsPage,
cancelOrder,
getOrderDetailsPages,
postAddNewAddress,
addNewaddress,

};