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
    const cart = await Cart.findOne({ userId: userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

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
        isBlocked: product.isBlocked, // Ensure this field is correctly retrieved
        isCategoryListed: product.category?.isListed !== false, // Corrected reference
      };
    });

    const outOfStockItems = cartItems.filter(item => item.quantity > item.availableStock);
    const blockedItems = cartItems.filter(item => item.isBlocked || !item.isCategoryListed);

    if (outOfStockItems.length > 0 || blockedItems.length > 0) {
      const outOfStockProductNames = outOfStockItems.map(item => item.productName).join(", ");
      const blockedProductNames = blockedItems.map(item => item.productName).join(", ");
      
      let errorMessage = "";
      if (outOfStockItems.length > 0) {
        errorMessage += `The following products are out of stock or have insufficient quantity: ${outOfStockProductNames}. `;
      }
      if (blockedItems.length > 0) {
        errorMessage += `The following products are blocked or belong to an unlisted category: ${blockedProductNames}. `;
      }

      return res.render("user/checkout-cart", {
        user: findUser,
        isCart: true,
        errorMessage,
        cartItems: cartItems.filter(item => !item.isBlocked && item.isCategoryListed), // Ensure blocked products are removed
        userAddress: addressData,
        orderId,
        grandTotal: 0,
        shippingCost: 0,
        Total: 0,
        coupons: [],
      });
    }

    const grandTotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = grandTotal > 1000 ? 0 : 100;
    let discount = 0;

    const today = new Date();
    const findCoupons = await Coupon.find({
      isList: true,
      createdOn: { $lt: today },
      expireOn: { $gt: today },
      minimumPrice: { $lt: grandTotal },
      userId: { $ne: userId },
    });

    const coupons = findCoupons.map((coupon) => ({
      name: coupon.name,
      offerPrice: coupon.offerPrice,
      minimumPrice: coupon.minimumPrice,
      expireOn: coupon.expireOn,
    }));

    const finalGrandTotal = (grandTotal + shippingCost) - discount;

    res.render("user/checkout-cart", {
      cartItems: cartItems.filter(item => !item.isBlocked && item.isCategoryListed), 
      user: findUser,
      orderId,
      isCart: true,
      userAddress: addressData,
      grandTotal: grandTotal.toFixed(2),
      discount: discount.toFixed(2),
      shippingCost: shippingCost.toFixed(2),
      finalGrandTotal: finalGrandTotal.toFixed(2),
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

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category" } // Populate category to check if it's listed
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty or not found." });
    }

    // Check for blocked or unlisted products
    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product not found: ${item.productId}` });
      }
      if (product.isBlocked) {
        return res.status(400).json({ error: `Product "${product.productName}" is currently unavailable.` });
      }
      if (product.category?.isListed === false) {
        return res.status(400).json({ error: `Product "${product.productName}" belongs to an unlisted category.` });
      }
      if (product.quantity < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.productName}. Available: ${product.quantity}, Requested: ${item.quantity}`,
        });
      }
    }

    const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const shippingCost = totalPrice > 1000 ? 0 : 100;
    let discount = 0;

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

      
      const currentDate = new Date();
      if (currentDate > couponDetails.expireOn) {
          return res.status(400).json({ success: false, message: "Coupon has expired." });
      }


      if (total < couponDetails.minimumPrice) {
          return res.status(400).json({
              success: false,
              message: `Minimum purchase amount of ₹${couponDetails.minimumPrice} not met.`,
          });
      }

     
      const discount = couponDetails.offerPrice;


      const shippingCost = total > 1000 ? 0 : 100;

     
      const finalGrand = (total ) - discount;
  console.log("final:",finalGrand)
  const finalGrandTotal=finalGrand+shippingCost
  console.log("end",finalGrandTotal)
      res.status(200).json({
          success: true,
          offerPrice: discount,
          finalGrandTotal: finalGrandTotal.toFixed(2), 
  
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


 const isPaymentPending = findOrder.paymentStatus === "Pending";
    let discount = 0;
    if (findOrder.couponName) {
      const validCoupon = await Coupon.findOne({ name: findOrder.couponName });
      discount = validCoupon ? validCoupon.offerPrice : 0;
    }

    const totalGrant = findOrder.totalPrice || 0; 
    const shippingCost = totalGrant > 1000 ? 0 : 100;

    const finalAmount = totalGrant + shippingCost - discount;

  
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

    if (!userId || !productId) {
      console.log("Missing userId or productId");
      return res.redirect("/pageNotFound");
    }


    const cart = await Cart.findOne({ userId: userId });

    if (!cart) {
      console.log("Cart not found for user");
      return res.status(404).json({ success: false, message: "Cart not found" });
    }


    const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId);
    if (itemIndex === -1) {
      console.log("Product not found in cart");
      return res.status(404).json({ success: false, message: "Product not found in cart" });
    }

    cart.items.splice(itemIndex, 1);

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

    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product") 
      .exec();

    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

   
    if (findOrder.orderStatus === "Cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    findOrder.orderStatus = "Cancelled";
    findOrder.cancellationReason = reason; 

    if (!findOrder.paymentDetails) {
      findOrder.paymentDetails = {};
    }

    let refundAmount = 0; 
    if (findOrder.paymentStatus === "Confirmed") {
      if (paymentMethod === "razorpay" || paymentMethod === "wallet") {
        findOrder.paymentStatus = "Refunded"; 
        findOrder.paymentDetails.paidAmount = 0; 

       
        if (paymentMethod === "razorpay" && findOrder.paymentDetails?.orderId) {
          refundAmount = Math.round(findOrder.finalAmount * 100); 
          const refund = await razorpayInstance.payments.refund(findOrder.paymentDetails.orderId, {
            amount: refundAmount, 
          });

          if (!refund) {
            return res.status(500).json({ message: "Refund failed, please try again." });
          }
          console.log("Refund initiated:", refund);
        }

    
        const wallet = new Wallet({
          userId: findOrder.userId,
          amount: findOrder.finalAmount,
          type: "Credit",
          description: `Refund for cancelled order ${orderId}`,
        });

        await wallet.save();

        
        const user = await User.findById(findOrder.userId);
        if (user) {
          user.wallet += findOrder.finalAmount; 
          await user.save();
          console.log("User wallet updated successfully:", user.wallet);
        }


        findOrder.refundAmount = findOrder.finalAmount; 
      } else {
        findOrder.paymentStatus = "Cancelled"; 
      }
    }

    await findOrder.save();


    for (const productData of findOrder.orderedItems) {
      const productId = productData.product._id;
      const quantity = productData.quantity;

      const product = await Product.findById(productId);
      if (product) {
        product.quantity += quantity; 
        await product.save();
      }
    }

    res.status(200).json({
      message: "Order cancelled successfully and refund credited to wallet if applicable",
      refundAmount: findOrder.refundAmount, 
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


    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product")
      .exec();

    if (!findOrder) {
      return res.status(404).render('error', { message: 'Order not found.' });
    }

    console.log("Fetched Order Data:", findOrder);

   
    let totalGrant = 0;
    if (findOrder.orderedItems && findOrder.orderedItems.length > 0) {
      findOrder.orderedItems.forEach((item) => {
        totalGrant += (item.product.salePrice || 0) * (item.quantity || 0); 
      });
    }

    const isPaymentPending = findOrder.paymentStatus === "Pending";
    

    const totalPrice = findOrder.totalPrice || totalGrant; 
    const shippingCost = totalGrant > 1000 ? 0 : 100;  
    const pay = totalPrice + shippingCost; 
    const discount = findOrder.discount || 0; 
    const finalAmount = totalPrice + shippingCost - discount; 
    
    let PaidAmount = null;
    if (findOrder.paymentMethod === "razorpay") {
      PaidAmount = findOrder.paymentDetails?.paidAmount || finalAmount; 
    }
    
   
    res.render('user/orderDetails', {
    
      orders: findOrder,
      address: findOrder.address || {}, 
      totalGrant: totalGrant.toLocaleString(),
      totalPrice: totalPrice.toLocaleString(),  
      discount: discount.toLocaleString(),  
      finalAmount: finalAmount.toLocaleString(),  
      shippingCost: shippingCost.toLocaleString(), 
      PaidAmount: PaidAmount?.toLocaleString() || null,  
      isPaymentPending,  
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
      amount: amount * 100, 
      currency: "INR",
      receipt: orderId,     
    };
  
    try {
      const razorpayOrder = await razorpayInstance.orders.create(razorpayOptions);
  
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

      const order = await Order.findOne({ orderId: orderId });
  console.log("order",order)
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
  
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
  
   
      const order = await Order.findOne({ orderId })
        .populate("orderedItems.product")
        .exec();
  
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      const activeItems = order.orderedItems.filter(item => item.status !== "Cancelled");
  
      if (activeItems.length === 1) {
  
        order.orderStatus = "Cancelled";
      }
  
    
      const itemIndex = order.orderedItems.findIndex(
        (item) => item.product._id.toString() === productId
      );
  
      if (itemIndex === -1) {
        return res.status(404).json({ message: "Item not found in order" });
      }
  
      const item = order.orderedItems[itemIndex];
  
    
      if (item.status === "Cancelled") {
        return res.status(400).json({ message: "Item is already cancelled" });
      }

      item.status = "Cancelled";
      item.cancellationReason = reason;
  
      let refundAmount = 0;
      if (order.paymentStatus === "Confirmed") {
        refundAmount = item.price * item.quantity;
  
        if (paymentMethod === "razorpay" && order.razorpayOrderId) {
          const refund = await razorpayInstance.payments.refund(order.razorpayOrderId, {
            amount: Math.round(refundAmount * 100),
          });
  
          if (!refund) {
            return res.status(500).json({ message: "Refund failed, please try again." });
          }
        }
  

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
  
        order.refundAmount = (order.refundAmount || 0) + refundAmount;
      }
  
 
      if (order.paymentStatus === "Pending") {
        
        order.finalAmount -= item.price * item.quantity;
 
        refundAmount = 0;
      }
  
    
      if (order.finalAmount < 0) {
        order.finalAmount = 0;
      }
  
    
      const product = await Product.findById(productId);
      if (product) {
        product.quantity += quantity;
        await product.save();
      }
  
   
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
  
      res.status(200).json(order);
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  const singlereturnRequest = async (req, res) => {
    const { orderId, productId, returnReason } = req.body;

    try {
        
        const order = await Order.findOne({ orderId: orderId }); 

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

       
        const item = order.orderedItems.find(item => item.product._id.toString() === productId);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Product not found in the order' });
        }

        
        if (item.status === 'Return Requested') {
            return res.status(400).json({ success: false, message: 'Return request already submitted' });
        }

    
        item.status = 'Return Requested';
        item.returnReason = returnReason;


        await order.save();

    
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

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: "Invalid Order ID" });
    }


    const order = await Order.findById(orderId).populate("userId");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

   
    const clientAddress = order.address;
    if (!clientAddress || !clientAddress.name) {
      return res.status(400).json({ error: "Order address information is missing" });
    }


    const doc = new PDFDocument({ margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Invoice_${orderId}.pdf`);

    
    doc.pipe(res);

  
    doc.font("Helvetica-Bold").fontSize(24).fillColor("#2C3E50").text("INVOICE", { align: "center" });
    doc.moveDown(0.5);

   
    const logoPath = "C:\\Users\\HP\\OneDrive\\Desktop\\flora gems\\public\\img\\[removal.ai]_f9e2b53c-dc7e-488a-a0da-fa14f2059a6a_Flora Gems.png";
    doc.image(logoPath, 50, 30, { width: 80 }).moveDown(1); 
    doc.fontSize(12).fillColor("#34495E").text("Flora Gems", 50, 90);
    doc.text("Thrikkakkara, Kozhikode, 682021, India");
    doc.text("Phone: +91-1234567890 | Email: support@floraGems.com");
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#2C3E50").text("Billed To:", { underline: true });
    doc.text(clientAddress.name || "N/A");
    doc.text(`${clientAddress.landMark || "N/A"}, ${clientAddress.city || "N/A"}`);
    doc.text(`${clientAddress.state || "N/A"}, ${clientAddress.pincode || "N/A"}`);
    doc.text(`Phone: ${clientAddress.phone || "N/A"}`);
    doc.moveDown(1);


    doc.fillColor("#2C3E50").fontSize(12).text(`Invoice Number: ${order.orderId}`);
    doc.text(`Invoice Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Order Status: ${order.orderStatus}`);
    doc.text(`Currency: INR`);
    doc.moveDown(1);

    const tableStartY = doc.y + 10; 
    const tableColumnWidths = [60, 300, 70, 70];

    doc.rect(50, tableStartY, 500, 20).fill("#BDC3C7").stroke();
    doc
      .fontSize(10)
      .fillColor("#2C3E50")
      .text("Qty", 55, tableStartY + 5)
      .text("Description", 115, tableStartY + 5)
      .text("Price", 420, tableStartY + 5)
      .text("Total", 490, tableStartY + 5);

  
    let currentY = tableStartY + 20;
    order.orderedItems.forEach((item, index) => {
      const rowColor = index % 2 === 0 ? "#ECF0F1" : "#FFFFFF";
      doc.rect(50, currentY, 500, 20).fill(rowColor).stroke();

    
      doc
        .fillColor("#2C3E50")
        .text(item.quantity.toString(), 55, currentY + 5)
        .text(item.product || "N/A", 115, currentY + 5)
        .text(`Rs${item.price.toFixed(2)}`, 420, currentY + 5)
        .text(`Rs${item.total.toFixed(2)}`, 490, currentY + 5);

      currentY += 20;
    });

   
    currentY += 10;
    doc.fontSize(12).fillColor("#34495E").text(`Subtotal: Rs${order.totalPrice.toFixed(2)}`, 420, currentY);
    doc.text(`Discount: Rs${order.discount.toFixed(2)}`, 420, currentY + 15);
    doc.text(`Final Amount: Rs${order.finalAmount.toFixed(2)}`, 420, currentY + 30);

  
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
