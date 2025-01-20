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
      });
    }

    //grand total (items total in cart)
    const grandTotal = cartItems.reduce((sum, item) => sum + item.total, 0);


    const shippingCost = grandTotal > 1000 ? 0 : 100;

    let discount = 0; 

    // Fetch valid coupons 
    const today = new Date();
    const findCoupons = await Coupon.find({
      isList: true,
      createdOn: { $lt: today },
      expireOn: { $gt: today },
      minimumPrice: { $lt: grandTotal },
    });

   //display available coupon

    const availableCoupons = findCoupons.map((coupon) => ({
      name: coupon.name,
      offerPrice: coupon.offerPrice,
      minimumPrice: coupon.minimumPrice,
      expireOn: coupon.expireOn,

    } 
  ));

   //finalGrand Total
    const finalGrandTotal = (grandTotal + shippingCost) - discount;

    // Format the totals to ensure two decimal places
    const formattedGrandTotal = grandTotal.toFixed(2);
    const formattedShippingCost = shippingCost.toFixed(2);
    const formattedFinalGrandTotal = finalGrandTotal.toFixed(2);

    res.render("user/checkout-cart", {
      cartItems,
      user: findUser,
      orderId: orderId,
      isCart: true,
      userAddress: addressData,
      grandTotal: formattedGrandTotal,  
      discount: discount.toFixed(2),    
      shippingCost: formattedShippingCost, 
      finalGrandTotal: formattedFinalGrandTotal,  
      Coupon: availableCoupons, 
    });

    console.log("Grand Total:", formattedGrandTotal);
    console.log("Discount:", discount);
    console.log("Shipping Cost:", formattedShippingCost);
    console.log("Final Grand Total:", formattedFinalGrandTotal);
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
//totalPrice
    const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
//shipping Cost
    const shippingCost = totalPrice > 1000 ? 0 : 100; 

    let discount = 0;

   
    if (couponApplied && couponName) {
      const couponDetails = await Coupon.findOne({ name: couponName });
      if (couponDetails) {
        // Check if the coupon is valid
        const currentDate = new Date();
        if (currentDate <= couponDetails.expireOn && totalPrice >= couponDetails.minimumPrice) {
          discount = couponDetails.offerPrice;
        }
      }
    }

    //  final amount
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
      })),
      paymentMethod: payment,
      paymentStatus: "Pending",
      orderStatus: "Pending",
      address: specificAddress,
      couponApplied,
      couponName: couponApplied ? couponName : null,
    });

    // Handle Razorpay payment
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

    // Handle COD payment
    if (payment === "cod") {
      newOrder.paymentDetails = {
        orderId: newOrder._id.toString(),
        status: "Pending",
      };
    }

    // Handle Wallet payment
    if (payment === "wallet") {
      const user = await User.findById(userId);
      if (user.wallet < finalAmount) {
        return res.status(400).json({ error: "Insufficient wallet balance" });
      }

     
      user.wallet -= finalAmount;
      await user.save();

      // Create a wallet transaction record
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
      newOrder.paymentDetails = {
        orderId: newOrder._id.toString(),
        status: "Confirmed",
        paymentMethod: "wallet",
      };
    }

 
    await newOrder.save();
    await Cart.updateOne({ userId }, { $set: { items: [] } });

    // Send response back
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

//verify payment during razorpay 
const verify = (req, res) => {
  let hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(
    `${req.body.payment.razorpay_order_id}|${req.body.payment.razorpay_payment_id}`
  );
  hmac = hmac.digest("hex");
  console.log(hmac,"HMAC");
  console.log(req.body.payment.razorpay_signature,"signature");
  if (hmac === req.body.payment.razorpay_signature) {
    console.log("true");
    res.json({ status: true });
  } else {
    console.log("false");
    res.json({ status: false });
  }
};

//payment confirm (change payment sttaus into confirmed )
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

 
    if (order.paymentMethod === "wallet") {
      return res.json({ status: true });
    }

    await Order.updateOne(
      { _id: orderId },
      { $set: { paymentStatus: "Confirmed" } }  
    );

    res.json({ status: true });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({ error: "Failed to confirm payment" });
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
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }
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
    if (findOrder.paymentStatus === "Confirmed") {
      if (paymentMethod === "razorpay" || paymentMethod === "wallet") {
        findOrder.paymentStatus = "Refunded"; // Set to 'Refunded' for both Razorpay and Wallet
        findOrder.paymentDetails.paidAmount = 0; // Set paid amount to 0 for cancellation

        // Handle refund through Razorpay
        if (paymentMethod === "razorpay" && findOrder.paymentDetails?.orderId) {
          const refund = await razorpayInstance.payments.refund(findOrder.paymentDetails.orderId, {
            amount: Math.round(findOrder.finalAmount * 100), // Refund amount in paise
          });

          if (!refund) {
            return res.status(500).json({ message: "Refund failed, please try again." });
          }
          console.log("Refund initiated:", refund);
        }

        // Add refund amount to wallet
        const wallet = new Wallet({
          userId: findOrder.userId,
          amount: findOrder.finalAmount,
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
    res.status(200).json({ message: "Order cancelled successfully and refund credited to wallet if applicable" });

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
            totalGrant += (item.product.salePrice || 0) * (item.quantity || 0); // Use salePrice from product
          });
        }
    
     
        const totalPrice = findOrder.totalPrice || totalGrant; 
        const shippingCost = totalGrant > 1000 ? 0 : 100;  
        const pay = totalPrice + shippingCost; 
        const discount = findOrder.discount || 0; 
        const finalAmount = totalPrice + shippingCost - discount; 
        
        let PaidAmount = null;
        if (findOrder.paymentMethod === "razorpay") {
          PaidAmount = findOrder.paymentDetails?.paidAmount || finalAmount; // Paid amount if Razorpay, else finalAmount
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
        });
      } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).render('error', { message: 'An error occurred while fetching the order details.' });
      }
    };
    const returnRequest = async (req, res) => {
      try {
        const { orderId } = req.body;
    
        if (!orderId) {
          return res.status(400).send({ status: false, message: "Order ID is required." });
        }
    
        const order = await Order.findOne({ orderId: orderId });
        if (!order) {
          return res.status(404).send({ status: false, message: "Order not found." });
        }
    
        // Update the order status
        order.orderStatus = "Return Request";
        await order.save();
    
        // Create a notification for the admin
        const notification = new Notification({
          type: "Return Request",
          message: `Return request received for Order ID: ${orderId}`,
          orderId: order._id,
        });
        await notification.save();
    
        res.send({ status: true, message: "Return request sent successfully." });
      } catch (error) {
        console.error("Error handling return request:", error);
        res.status(500).send({ status: false, message: "Failed to handle return request." });
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
returnRequest,
checkBalance

};