const User = require("../../models/userschema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongodb = require("mongodb");
const mongoose = require('mongoose')
const env = require("dotenv").config();
const crypto = require("crypto");
const Coupon=require("../../models/couponSchema");
const { v4: uuidv4 } = require('uuid');
const objectId = new mongoose.Types.ObjectId(); // Generates a new ObjectId

const getOrderListPageAdmin = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdOn: -1 }).lean();

    // Fetch user details for each order
    for (let order of orders) {
      const userDetails = await User.findById(order.userId); // Fetch user by userId
      order.user = userDetails || null; // Add user details or set to null
    }

    let itemsPerPage = 3;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);
    const currentOrder = orders.slice(startIndex, endIndex);

    res.render("admin/order-list", { orders: currentOrder, totalPages, currentPage });
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};
const changeOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.query;
    console.log("Query Parameters:", req.query);

    // Find and update the order using orderId
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    console.log("Received Order ID:", orderId);

    order.status = status;
    await order.save();

    return res.status(200).json({ status: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred" });
  }
};


const getOrderDetailsPageAdmin = async (req, res) => {
  try {
    const orderId = req.query.orderId; // Get orderId from query
    console.log("Received orderId:", orderId);
    if (!orderId) {
      throw new Error("orderId is required");
    }
    const orders = await Order.find({}).sort({ createdOn: -1 }).lean();
    // Find the order and populate the `product` field in `orderedItems`
    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product")
      .populate("userId") // Populate product details
      .lean(); // Convert to plain JS object for easier manipulation

    console.log(findOrder);
    const addressDocument = await Address.findOne({ "address._id": findOrder.addressId });
    const specificAddress = addressDocument
      ? addressDocument.address.find((addr) => addr._id.toString() === findOrder.addressId.toString())
      : null;
    if (!findOrder) {
      throw new Error("Order not found");
    }
    for (let order of orders) {
      const userDetails = await User.findById(order.userId); // Fetch user by userId
      order.user = userDetails || null; // Add user details or set to null
    }

    // Calculate the total grant and other financial details
    let totalGrant = 0;
    findOrder.orderedItems.forEach((item) => {
      totalGrant += item.price * item.quantity;
    });

    const totalPrice = findOrder.totalPrice;
    const discount = totalGrant - totalPrice; // Calculate the discount
    const finalAmount = totalPrice;

    res.render("admin/order-details-admin", {
      orders: findOrder,
      orderId: orderId,
      finalAmount: finalAmount,
      discount: discount,
      address: specificAddress, // Pass the discount to the view
    });
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
}
module.exports = {
  getOrderListPageAdmin,
  changeOrderStatus,
  getOrderDetailsPageAdmin,
}

