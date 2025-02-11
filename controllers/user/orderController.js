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
const Notification = require("../../models/notificationSchema");
const Razorpay=require("razorpay")
const crypto = require("crypto");
const Wallet=require("../../models/walletSchema")
const WalletTransaction=require("../../models/walletSchema")
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');

let razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const getCheckoutPage = async (req, res) => {
  try {
    const orderId = uuidv4();
    const userId = req.query.userId;

    if (!userId || !ObjectId.isValid(userId)) {
      return res.redirect("/login");
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
        availableStock: product.quantity,
      };
    });

    const outOfStockItems = cartItems.filter((item) => item.quantity > item.availableStock);
    if (outOfStockItems.length > 0) {
      const outOfStockProductNames = outOfStockItems.map((item) => item.productName).join(", ");
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
        coupons: [], // Pass an empty array if stock is insufficient
      });
    }

    // Grand total (items total in cart)
    const grandTotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = grandTotal > 1000 ? 0 : 100;
    let discount = 0;

    // Fetch valid coupons that have not been used by the current user
    const today = new Date();
    const findCoupons = await Coupon.find({
      isList: true,
      createdOn: { $lt: today },
      expireOn: { $gt: today },
      minimumPrice: { $lt: grandTotal },
      userId: { $ne: userId }, // Exclude coupons already used by the user
    });

    const coupons = findCoupons.map((coupon) => ({
      name: coupon.name,
      offerPrice: coupon.offerPrice,
      minimumPrice: coupon.minimumPrice,
      expireOn: coupon.expireOn,
    }));

    // Final grand total
    const finalGrandTotal = (grandTotal + shippingCost) - discount;

    // Format the totals to ensure two decimal places
    const formattedGrandTotal = grandTotal.toFixed(2);
    const formattedShippingCost = shippingCost.toFixed(2);
    const formattedFinalGrandTotal = finalGrandTotal.toFixed(2);

    res.render("user/checkout-cart", {
      cartItems,
      user: findUser,
      orderId,
      isCart: true,
      userAddress: addressData,
      grandTotal: formattedGrandTotal,
      discount: discount.toFixed(2),
      shippingCost: formattedShippingCost,
      finalGrandTotal: formattedFinalGrandTotal,
      coupons, 
    });
  } catch (error) {
    console.error("Error in getCheckoutPage:", error);
    res.redirect("/pageNotFound");
  }
};



const orderPlaced = async (req, res) => {
  try {
    const user = req.session?.user?._id;
    if (!ObjectId.isValid(user)) {
      return res.redirect("/login");
    }

    const { userId, addressId, payment, couponApplied, couponName } = req.body;

    if (!userId || !addressId || !payment) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty or not found." });
    }

    // Check stock availability for each product in the cart
    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product not found: ${item.productId}` });
      }
      if (product.quantity < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.productName}. Available: ${product.quantity}, Requested: ${item.quantity}`,
        });
      }
    }

    // Calculate total price
    const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const shippingCost = totalPrice > 1000 ? 0 : 100;
    let discount = 0;

    // Handle coupon application
    if (couponApplied && couponName) {
      const couponDetails = await Coupon.findOne({ name: couponName });
      if (couponDetails) {
        const currentDate = new Date();
        if (currentDate <= couponDetails.expireOn && totalPrice >= couponDetails.minimumPrice) {
          discount = couponDetails.offerPrice;
          couponDetails.userId.push(userId);
          await couponDetails.save();
        }
      }
    }

    // Calculate final amount
    const finalAmount = totalPrice + shippingCost - discount;

    // Fetch the user's address
    const userAddress = await Address.findOne({ userId });
    const specificAddress = userAddress.address.find((addr) => addr._id.toString() === addressId);
    if (!specificAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Create the new order
    const newOrder = new Order({
      userId,
      totalPrice,
      finalAmount,
      discount,
      orderedItems: cart.items.map((item) => ({
        product: item.productId._id,
        quantity: item.quantity,
        price: item.price,
        total: item.totalPrice,
        paymentStatus: payment === "razorpay" || payment === "wallet" ? "Confirmed" : "Pending",
      })),
      paymentMethod: payment,
      paymentStatus: "Pending",
      orderStatus: "Pending",
      address: specificAddress,
      couponApplied,
      couponName: couponApplied ? couponName : null,
    });

    // Handle payment processing (Razorpay, COD, Wallet)
    if (payment === "razorpay") {
      const razorPayOrder = await razorpayInstance.orders.create({
        amount: Math.round(finalAmount * 100),
        currency: "INR",
        receipt: newOrder._id.toString(),
      });

      newOrder.paymentDetails = {
        orderId: razorPayOrder.id,
        finalAmount: finalAmount,
        status: "Created",
      };
    }

    if (payment === "cod") {
      newOrder.paymentDetails = {
        orderId: newOrder._id.toString(),
        status: "Pending",
      };
    }

    if (payment === "wallet") {
      const user = await User.findById(userId);
      if (user.wallet < finalAmount) {
        return res.status(400).json({ error: "Insufficient wallet balance" });
      }

      user.wallet -= finalAmount;
      await user.save();

      const walletTransaction = new WalletTransaction({
        userId,
        amount: finalAmount,
        type: "Debit",
        description: `Order payment for Order ID: ${newOrder._id}`,
        status: "Success",
        source: "Purchase",
      });
      await walletTransaction.save();

      newOrder.paymentStatus = "Confirmed";
      newOrder.orderedItems.forEach((item) => {
        item.paymentStatus = "Confirmed";
      });

      newOrder.paymentDetails = {
        orderId: newOrder._id.toString(),
        status: "Confirmed",
        paymentMethod: "wallet",
      };
    }

    // Save the new order and clear the cart
    await newOrder.save();


    res.status(200).json({
      message: "Order placed successfully.",
      order: newOrder,
      orderId: newOrder._id.toString(),
      razorPayOrder: payment === "razorpay" ? newOrder.paymentDetails : null,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ error: "Failed to place order. Please try again later." });
  }
};


const verify = (req, res) => {
  try {
    let hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body.payment;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing required payment details." });
    }

    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest("hex");

    console.log("Generated HMAC:", generatedSignature);
    console.log("Received Signature:", razorpay_signature);

    if (generatedSignature === razorpay_signature) {
      console.log("Payment signature verified successfully.");
      res.json({ status: true });
    } else {
      console.log("Payment verification failed.");
      res.json({ status: false });
    }
  } catch (error) {
    console.error("Error in payment verification:", error);
    res.status(500).json({ error: "Failed to verify payment." });
  }
};


const paymentConfirm = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.paymentStatus === "Confirmed") {
      return res.json({ status: true, message: "Payment already confirmed." });
    }

    if (order.paymentMethod === "wallet") {
      return res.json({ status: true });
    }

    // Confirm payment
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentStatus: "Confirmed",
          "orderedItems.$[].paymentStatus": "Confirmed",
        }
      }
    );

    // Reduce stock quantity for each product
    for (const item of order.orderedItems) {
      await Product.updateOne(
        { _id: item.product },
        { $inc: { quantity: -item.quantity } }
      );
    }

    res.json({ status: true, message: "Payment confirmed and stock updated." });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({ error: "Failed to confirm payment." });
  }
};



      const applyCoupon = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }
      const { coupon, total } = req.body;

      console.log("Coupon Name:", coupon);
      console.log("Total Before Discount:", total);

      if (!coupon || !total) {
          return res.status(400).json({
              success: false,
              message: "Coupon code and total are required.",
          });
      }

      const couponDetails = await Coupon.findOne({ name: coupon });

      if (!couponDetails) {
          return res.status(400).json({ success: false, message: "Invalid coupon code." });
      }

      // Validate coupon expiry
      const currentDate = new Date();
      if (currentDate > couponDetails.expireOn) {
          return res.status(400).json({ success: false, message: "Coupon has expired." });
      }

      // Validate minimum purchase amount
      if (total < couponDetails.minimumPrice) {
          return res.status(400).json({
              success: false,
              message: `Minimum purchase amount of ₹${couponDetails.minimumPrice} not met.`,
          });
      }

      // Calculate the discount
      const discount = couponDetails.offerPrice;

      // Calculate shipping cost (free shipping for totals > ₹1000)
      const shippingCost = total > 1000 ? 0 : 100;

      // Calculate the final grand total using the same formula
      const finalGrand = (total ) - discount;
  console.log("final:",finalGrand)
  const finalGrandTotal=finalGrand+shippingCost
  console.log("end",finalGrandTotal)
      res.status(200).json({
          success: true,
          offerPrice: discount,
          finalGrandTotal: finalGrandTotal.toFixed(2), 
         // Ensure final amount is formatted to 2 decimal places
      });
  } catch (error) {
      console.error("Error applying coupon:", error);
      res.status(500).json({
          success: false,
          message: "Internal server error. Please try again later.",
      });
  }
};

const getOrderDetailsPage = async (req, res) => {
  try {
    
    const orderId = req.query.id;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required." });
    }

    const query = mongoose.Types.ObjectId.isValid(orderId)
      ? { _id: orderId }
      : { orderId: orderId };

    const findOrder = await Order.findOne(query)
      .populate("orderedItems.product")
      .exec();

    if (!findOrder) {
      return res.status(404).json({ error: "Order not found." });
    }

 // Check payment status
 const isPaymentPending = findOrder.paymentStatus === "Pending";
    let discount = 0;
    if (findOrder.couponName) {
      const validCoupon = await Coupon.findOne({ name: findOrder.couponName });
      discount = validCoupon ? validCoupon.offerPrice : 0;
    }

    const totalGrant = findOrder.totalPrice || 0; 
    const shippingCost = totalGrant > 1000 ? 0 : 100;

    // Final amount after applying discount and adding shipping cost
    const finalAmount = totalGrant + shippingCost - discount;

    // Determine whether to show PaidAmount else final amount
    let PaidAmount = null;
    if (findOrder.paymentMethod === "razorpay"&&findOrder.paymentMethod === "wallet") {
      PaidAmount = findOrder.paymentDetails?.paidAmount || finalAmount; 
    }
   

    res.render("user/orderDetails", {
      
      orders: findOrder,
      address: findOrder.address,
      totalGrant,        
      shippingCost,     
      discount,           
      finalAmount,      
      PaidAmount,        
      paymentMethod: findOrder.paymentMethod || "COD",  
      orderStatus: findOrder.orderStatus || "Pending",
      isPaymentPending  
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Failed to fetch order details. Please try again later." });
  }
};


const deleteProduct = async (req, res) => {
  try {
    const productId = req.query.id;
    const userId = req.session.user._id; 

    console.log("User ID:", userId); 
    console.log("Product ID:", productId); 

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
    const { orderId, reason, paymentMethod } = req.body;

    // Find the order by orderId (not _id)
    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product") // Populate product details
      .exec();

    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if the order is already cancelled
    if (findOrder.orderStatus === "Cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    // Update order status to "Cancelled"
    findOrder.orderStatus = "Cancelled";
    findOrder.cancellationReason = reason; // Save the cancellation reason

    // Initialize paymentDetails if undefined
    if (!findOrder.paymentDetails) {
      findOrder.paymentDetails = {};
    }

    // Handle refund logic only if payment status is "Confirmed"
    let refundAmount = 0; // Initialize refundAmount
    if (findOrder.paymentStatus === "Confirmed") {
      if (paymentMethod === "razorpay" || paymentMethod === "wallet") {
        findOrder.paymentStatus = "Refunded"; // Set to 'Refunded' for both Razorpay and Wallet
        findOrder.paymentDetails.paidAmount = 0; // Set paid amount to 0 for cancellation

        // Refund logic for Razorpay
        if (paymentMethod === "razorpay" && findOrder.paymentDetails?.orderId) {
          refundAmount = Math.round(findOrder.finalAmount * 100); // Refund amount in paise
          const refund = await razorpayInstance.payments.refund(findOrder.paymentDetails.orderId, {
            amount: refundAmount, // Refund amount
          });

          if (!refund) {
            return res.status(500).json({ message: "Refund failed, please try again." });
          }
          console.log("Refund initiated:", refund);
        }

        // Add refund amount to wallet
        const wallet = new Wallet({
          userId: findOrder.userId,
          amount: findOrder.finalAmount, // Use finalAmount for wallet credit
          type: "Credit",
          description: `Refund for cancelled order ${orderId}`,
        });

        await wallet.save();

        // Update the user's wallet balance
        const user = await User.findById(findOrder.userId);
        if (user) {
          user.wallet += findOrder.finalAmount; // Increase the wallet balance
          await user.save();
          console.log("User wallet updated successfully:", user.wallet);
        }

        // Add the refund amount to the order as refundAmount
        findOrder.refundAmount = findOrder.finalAmount; // Set the refundAmount
      } else {
        findOrder.paymentStatus = "Cancelled"; // Set to 'Cancelled' for COD
      }
    }

    await findOrder.save();

    // Loop through the products and update their quantities
    for (const productData of findOrder.orderedItems) {
      const productId = productData.product._id;
      const quantity = productData.quantity;

      const product = await Product.findById(productId);
      if (product) {
        product.quantity += quantity; // Restore the quantity of the product
        await product.save();
      }
    }

    // Send success response
    res.status(200).json({
      message: "Order cancelled successfully and refund credited to wallet if applicable",
      refundAmount: findOrder.refundAmount, // Return the refund amount in the response
    });

  } catch (error) {
    console.error("Error canceling order:", error);
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
    const orders = await Order.find({ userId: req.session.user}) 
        .populate('orderedItems.product') 
        .sort({ createdAt: -1 }); 
        const page = parseInt(req.query.page) || 1;
        const limit = 2;  
        const skip = (page - 1) * limit;

    try {
      const orders = await Order.find({ userId })
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 });  
      const totalOrders = await Order.countDocuments({ userId });
    res.render('user/myOrder', { orders  ,  totalPages: Math.ceil(totalOrders / limit),
      currentPage: page,}); 
} catch (error) {
    console.error(error);
    res.status(500).send('Error fetching orders');
}
}

const getOrderDetailsPages = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const orderId = req.params.orderId; 
    console.log("Order ID being queried:", orderId);
    
    if (!orderId) {
      return res.status(400).render('error', { message: 'Order ID is required.' });
    }

    // Fetch the order from the database
    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product")
      .exec();

    if (!findOrder) {
      return res.status(404).render('error', { message: 'Order not found.' });
    }

    console.log("Fetched Order Data:", findOrder);

    // Calculate total grant (sum of item prices)
    let totalGrant = 0;
    if (findOrder.orderedItems && findOrder.orderedItems.length > 0) {
      findOrder.orderedItems.forEach((item) => {
        totalGrant += (item.product.salePrice || 0) * (item.quantity || 0); // Use salePrice from product
      });
    }

    // Check if payment is pending
    const isPaymentPending = findOrder.paymentStatus === "Pending";
    
    // Calculate price details
    const totalPrice = findOrder.totalPrice || totalGrant; 
    const shippingCost = totalGrant > 1000 ? 0 : 100;  
    const pay = totalPrice + shippingCost; 
    const discount = findOrder.discount || 0; 
    const finalAmount = totalPrice + shippingCost - discount; 
    
    let PaidAmount = null;
    if (findOrder.paymentMethod === "razorpay") {
      PaidAmount = findOrder.paymentDetails?.paidAmount || finalAmount; // Paid amount if Razorpay, else finalAmount
    }
    
    // Render the order details page
    res.render('user/orderDetails', {
    
      orders: findOrder,
      address: findOrder.address || {}, 
      totalGrant: totalGrant.toLocaleString(),
      totalPrice: totalPrice.toLocaleString(),  
      discount: discount.toLocaleString(),  
      finalAmount: finalAmount.toLocaleString(),  
      shippingCost: shippingCost.toLocaleString(), 
      PaidAmount: PaidAmount?.toLocaleString() || null,  
      isPaymentPending,  // Pass the payment status to the view
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).render('error', { message: 'An error occurred while fetching the order details.' });
  }
};


    const checkBalance = async (req, res) => {
      try{
      const { userId } = req.body;
        console.log("Checking wallet balance for user:", userId);  
        const user = await User.findById(userId);

        if (!user) {
            console.log("User not found");  
            return res.status(404).json({ success: false, message: "User not found" });
        }

        console.log("User found, wallet balance:", user.wallet); 
        res.json({ success: true, walletBalance: user.wallet });
    } catch (error) {
        console.error("Error checking wallet balance:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }

  }
  const createRazorpayOrder = async (req, res) => {
    const { orderId, amount } = req.body;
  
    const razorpayOptions = {
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: orderId,     // Use your database orderId as the receipt
    };
  
    try {
      const razorpayOrder = await razorpayInstance.orders.create(razorpayOptions);
      // Save Razorpay orderId in your database
      await Order.updateOne(
        { orderId: orderId },
        { $set: { razorpayOrderId: razorpayOrder.id } }
      );
      res.json({
        razorpayOrderId: razorpayOrder.id,
        databaseOrderId: orderId,
        amount: razorpayOrder.amount,
      });
    } catch (error) {
      console.error("Error creating Razorpay order:", error);
      res.status(500).json({ error: "Failed to create Razorpay order" });
    }
  };
  
  const verifyPayment = async (req, res) => {
    const { orderId, payment } = req.body;
    console.log("Request body:", req.body);

  
    let hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`);
    hmac = hmac.digest("hex");
  
    if (hmac !== payment.razorpay_signature) {
      console.error("Signature mismatch");
      return res.status(400).json({ error: "Invalid payment signature" });
    }
  
    console.log("Verifying payment for orderId:", orderId);
  
    try {
      // Find the order using the database orderId
      const order = await Order.findOne({ orderId: orderId });
  console.log("order",order)
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
  
      // Update Razorpay order ID and payment status in the database
      await Order.updateOne(
        { orderId: orderId },
        {
          $set: {
            razorpayOrderId: payment.razorpay_order_id,
            paymentStatus: "Confirmed",
          },
        }
      );
  
      res.json({ status: true });
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ error: "Failed to verify payment" });
    }
  };
  const cancelProductItem = async (req, res) => {
    try {
      const { orderId, productId, quantity, paymentMethod ,reason} = req.body;
      console.log(req.body)
  
      // Find the order
      const order = await Order.findOne({ orderId })
        .populate("orderedItems.product")
        .exec();
  
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      const activeItems = order.orderedItems.filter(item => item.status !== "Cancelled");
  
      if (activeItems.length === 1) {
        // Update order status to "Cancelled" if it's the last active item
        order.orderStatus = "Cancelled";
      }
  
      // Find the item in the order
      const itemIndex = order.orderedItems.findIndex(
        (item) => item.product._id.toString() === productId
      );
  
      if (itemIndex === -1) {
        return res.status(404).json({ message: "Item not found in order" });
      }
  
      const item = order.orderedItems[itemIndex];
  
      // Check if the item is already cancelled
      if (item.status === "Cancelled") {
        return res.status(400).json({ message: "Item is already cancelled" });
      }
  
      // Update the item status
      item.status = "Cancelled";
      item.cancellationReason = reason;
  
      // Calculate refund amount (if payment status is confirmed)
      let refundAmount = 0;
      if (order.paymentStatus === "Confirmed") {
        refundAmount = item.price * item.quantity;
  
        // Process refund if applicable
        if (paymentMethod === "razorpay" && order.razorpayOrderId) {
          const refund = await razorpayInstance.payments.refund(order.razorpayOrderId, {
            amount: Math.round(refundAmount * 100),
          });
  
          if (!refund) {
            return res.status(500).json({ message: "Refund failed, please try again." });
          }
        }
  
        // Add refund to wallet if applicable
        if (paymentMethod === "wallet" || paymentMethod === "razorpay") {
          const wallet = new Wallet({
            userId: order.userId,
            amount: refundAmount,
            type: "Credit",
            description: `Refund for cancelled item in order ${orderId}`,
          });
  
          await wallet.save();
  
          const user = await User.findById(order.userId);
          if (user) {
            user.wallet += refundAmount;
            await user.save();
          }
        }
  
        // Increment the refundAmount in the order
        order.refundAmount = (order.refundAmount || 0) + refundAmount;
      }
  
      // Handle pending payment status
      if (order.paymentStatus === "Pending") {
        // Deduct the canceled item's price from the final amount
        order.finalAmount -= item.price * item.quantity;
  
        // Ensure refundAmount remains zero
        refundAmount = 0;
      }
  
      // Ensure finalAmount does not go below zero
      if (order.finalAmount < 0) {
        order.finalAmount = 0;
      }
  
      // Update product quantity in stock
      const product = await Product.findById(productId);
      if (product) {
        product.quantity += quantity;
        await product.save();
      }
  
      // Save the updated order
      await order.save();
  
      res.status(200).json({
        message: "Item cancelled successfully",
        refundAmount,
      });
    } catch (error) {
      console.error("Error cancelling item:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  
  const fetchOrderDetail = async (req, res) => {
    try {
      console.log('Fetching order details for orderId:', req.params.orderId);
      const { orderId } = req.params;
      const order = await Order.findOne({ orderId }).populate("orderedItems.product").exec();
  
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      res.status(200).json(order);  // Return the order as JSON
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  const singlereturnRequest = async (req, res) => {
    const { orderId, productId, returnReason } = req.body;

    try {
        // Find the order by orderId (which is a string, not an ObjectId)
        const order = await Order.findOne({ orderId: orderId }); // Use orderId as a string

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Find the item in the orderedItems array
        const item = order.orderedItems.find(item => item.product._id.toString() === productId);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Product not found in the order' });
        }

        // Check if the return request is already made
        if (item.status === 'Return Requested') {
            return res.status(400).json({ success: false, message: 'Return request already submitted' });
        }

        // Update the item status to 'Return Requested'
        item.status = 'Return Requested';
        item.returnReason = returnReason;

        // Save the updated order
        await order.save();

        // Notify the admin about the return request
        const notification = new Notification({
            type: 'Return Request',
            message: `Return request submitted for Product: ${item.product.productName} (Order ID: ${orderId}). Reason: ${returnReason}`,
            orderId: orderId,
            productId: productId,
            status: 'Unread',
            createdAt: new Date(),
        });

        await notification.save();

        res.status(200).json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again later.' });
    }
};

const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate the orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: "Invalid Order ID" });
    }

    // Fetch the order from the database
    const order = await Order.findById(orderId).populate("userId");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Validate the address structure
    const clientAddress = order.address;
    if (!clientAddress || !clientAddress.name) {
      return res.status(400).json({ error: "Order address information is missing" });
    }

    // Set up PDF headers
    const doc = new PDFDocument({ margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Invoice_${orderId}.pdf`);

    // Pipe the PDF document to the response
    doc.pipe(res);

    // Header Section
    doc.font("Helvetica-Bold").fontSize(24).fillColor("#2C3E50").text("INVOICE", { align: "center" });
    doc.moveDown(0.5);

    // Company Logo and Details
    const logoPath = "C:\\Users\\HP\\OneDrive\\Desktop\\flora gems\\public\\img\\[removal.ai]_f9e2b53c-dc7e-488a-a0da-fa14f2059a6a_Flora Gems.png";
    doc.image(logoPath, 50, 30, { width: 80 }).moveDown(1); // Use the local path for the logo
    doc.fontSize(12).fillColor("#34495E").text("Flora Gems", 50, 90);
    doc.text("Thrikkakkara, Kozhikode, 682021, India");
    doc.text("Phone: +91-1234567890 | Email: support@floraGems.com");
    doc.moveDown(1);

    // Client Information
    doc.fontSize(12).fillColor("#2C3E50").text("Billed To:", { underline: true });
    doc.text(clientAddress.name || "N/A");
    doc.text(`${clientAddress.landMark || "N/A"}, ${clientAddress.city || "N/A"}`);
    doc.text(`${clientAddress.state || "N/A"}, ${clientAddress.pincode || "N/A"}`);
    doc.text(`Phone: ${clientAddress.phone || "N/A"}`);
    doc.moveDown(1);

    // Invoice Details
    doc.fillColor("#2C3E50").fontSize(12).text(`Invoice Number: ${order.orderId}`);
    doc.text(`Invoice Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Order Status: ${order.orderStatus}`);
    doc.text(`Currency: INR`);
    doc.moveDown(1);

    // Products Table Header
    const tableStartY = doc.y + 10; // Start position for the table
    const tableColumnWidths = [60, 300, 70, 70]; // Column widths: Qty, Description, Price, Total

    doc.rect(50, tableStartY, 500, 20).fill("#BDC3C7").stroke();
    doc
      .fontSize(10)
      .fillColor("#2C3E50")
      .text("Qty", 55, tableStartY + 5)
      .text("Description", 115, tableStartY + 5)
      .text("Price", 420, tableStartY + 5)
      .text("Total", 490, tableStartY + 5);

    // Products Table Rows
    let currentY = tableStartY + 20;
    order.orderedItems.forEach((item, index) => {
      const rowColor = index % 2 === 0 ? "#ECF0F1" : "#FFFFFF";
      doc.rect(50, currentY, 500, 20).fill(rowColor).stroke();

      // Add text to each column
      doc
        .fillColor("#2C3E50")
        .text(item.quantity.toString(), 55, currentY + 5)
        .text(item.product || "N/A", 115, currentY + 5)
        .text(`Rs${item.price.toFixed(2)}`, 420, currentY + 5)
        .text(`Rs${item.total.toFixed(2)}`, 490, currentY + 5);

      currentY += 20;
    });

    // Totals Section
    currentY += 10;
    doc.fontSize(12).fillColor("#34495E").text(`Subtotal: Rs${order.totalPrice.toFixed(2)}`, 420, currentY);
    doc.text(`Discount: Rs${order.discount.toFixed(2)}`, 420, currentY + 15);
    doc.text(`Final Amount: Rs${order.finalAmount.toFixed(2)}`, 420, currentY + 30);

    // Footer
    doc.moveDown(2);
    doc.fontSize(10).fillColor("#7F8C8D").text("Thank you for your Order!", { align: "center" });

    // Finalize the PDF
    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({ error: `An error occurred while generating the invoice: ${error.message}` });
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
verify,
paymentConfirm,
applyCoupon,

checkBalance,
createRazorpayOrder,
verifyPayment,
cancelProductItem,
fetchOrderDetail,
singlereturnRequest,
downloadInvoice

};
