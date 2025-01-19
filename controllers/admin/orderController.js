const User = require("../../models/userschema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongodb = require("mongodb");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose')
const env = require("dotenv").config();
const crypto = require("crypto");
const Razorpay=require("razorpay")
const Coupon=require("../../models/couponSchema");
const Notification=require("../../models/notificationSchema")
const Wallet = require("../../models/walletSchema");
let razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const { v4: uuidv4 } = require('uuid');
const objectId = new mongoose.Types.ObjectId(); // Generates a new ObjectId
const getOrderListPageAdmin = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 }).lean(); // Sorting by createdAt instead of createdOn

    // Fetch user details for each order and calculate the final amount correctly
    for (let order of orders) {
      const userDetails = await User.findById(order.userId); // Fetch user by userId
      order.user = userDetails || null; // Add user details or set to null

      // Shipping cost rule: if total price > 1000, charge 100 as shipping cost
      let shippingCost = order.totalPrice < 1000 ? 100 : 0; // Apply shipping cost if totalPrice > 1000

      // Apply the shipping cost and discount to calculate the final amount
      let discount = order.discount || 0; // Default to 0 if no discount
      order.finalAmount = order.totalPrice + shippingCost - discount; // Apply shipping and discount

      // Ensure that finalAmount is not negative
      if (order.finalAmount < 0) {
        order.finalAmount = 0;
      }
    }
   
    let itemsPerPage = 3;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);
    const currentOrder = orders.slice(startIndex, endIndex);

    // Ensure payment and status are passed correctly
    res.render("admin/order-list", { orders: currentOrder, totalPages, currentPage });
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};

const changeOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.query;

    // Validate the status to ensure it matches the allowed statuses
    const validStatuses = [
      "Pending", "Processing", "Shipped", "Delivered", "Cancelled", 
      "Return Request", "Returned"
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ status: false, message: "Invalid status" });
    }

    // Find the order by orderId
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    // Update the order status
    order.orderStatus = status;
    await order.save();

    return res.status(200).json({ status: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred" });
  }
};
const getOrderDetailsPageAdmin = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    if (!orderId) throw new Error("Order ID is required.");

    const findOrder = await Order.findOne({ orderId })
      .populate("orderedItems.product")
      .populate("userId")
      .lean();

    if (!findOrder) throw new Error("Order not found.");

    const addressDocument = await Address.findOne({ "address._id": findOrder.addressId });
    const specificAddress = addressDocument
      ? addressDocument.address.find((addr) => addr._id.toString() === findOrder.addressId.toString())
      : null;

    const totalGrant = findOrder.orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = totalGrant - findOrder.totalPrice;
    const finalAmount = findOrder.totalPrice;

    const coupon = findOrder.couponName
      ? await Coupon.findOne({ name: findOrder.couponName })
      : null;
    const couponDiscount = coupon ? coupon.offerPrice || 0 : 0;

    const notifications = await Notification.find({ orderId: findOrder._id });

    res.render("admin/order-details-admin", {
      orders: findOrder,
      orderId,
      finalAmount,
      discount: discount + couponDiscount,
      address: specificAddress,
      paymentStatus: findOrder.paymentStatus,
      orderStatus: findOrder.orderStatus,
      couponDetails: coupon,
      couponDiscount,
      notifications,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};


const respondReturn=async (req, res) => {
  const { notificationId, action } = req.body;

  try {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).send({ status: false, message: "Notification not found." });
    }

    // Update order status based on action
    const order = await Order.findById(notification.orderId);
    if (!order) {
      return res.status(404).send({ status: false, message: "Order not found." });
    }

    if (action === "Accept") {
      order.orderStatus = "Refund Approved";
    } else if (action === "Reject") {
      order.orderStatus = "Refund Rejected";
    }

    await order.save();

    // Mark the notification as read or remove it
    await Notification.findByIdAndDelete(notificationId);

    res.send({ status: true, message: `Return request ${action.toLowerCase()}ed successfully.` });
  } catch (error) {
    console.error("Error responding to return request:", error);
    res.status(500).send({ status: false, message: "Failed to respond to return request." });
  }
}
const updateReturnStatus= async (req, res) => {
  const { orderId, status } = req.body; // Get the orderId and status from the request body

    try {
        // Find the order by its orderId
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Update the return status and other related fields based on the action
        if (status === 'accepted') {
            order.orderStatus = 'Return Pending';
            order.paymentStatus = 'Pending'; // Assuming payment is pending for returns
        } else if (status === 'rejected') {
            order.orderStatus = 'Return Failed';
        }

        // Save the updated order
        await order.save();

        return res.json({ success: true, message: `Return request ${status} successfully.` });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Failed to update return status." });
    }
};
const confirmReturnStatus=async (req, res) => {
  const { orderId } = req.body;

  try {
      const order = await Order.findOne({ orderId: orderId });

      if (!order) {
          return res.status(404).json({ success: false, message: "Order not found" });
      }

      // Change the order status to "Return Processing" and payment status to "Refund Processing"
      order.orderStatus = "Return Processing";
      order.paymentStatus = "Refund Processing";

      await order.save();

      return res.json({ success: true, message: "Order status changed to Return Processing" });
  } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Failed to update order status" });
  }
};
const completeReturn = async (req, res) => {
  const { orderId } = req.body;

  try {
    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Change the order status to "Returned" and payment status to "Refunded"
    order.orderStatus = "Returned";
    order.paymentStatus = "Refunded";

    // Handle refund logic
    if (order.paymentMethod === "razorpay" && order.paymentDetails?.orderId) {
      const refund = await razorpayInstance.payments.refund(order.paymentDetails.orderId, {
        amount: Math.round(order.finalAmount * 100), // Refund amount in paise
      });

      if (!refund) {
        return res.status(500).json({ success: false, message: "Refund failed, please try again." });
      }
      console.log("Refund initiated:", refund);

      // Add refund amount to wallet
      const wallet = new Wallet({
        userId: order.userId,
        amount: order.finalAmount,
        type: "Credit",
        description: `Refund for returned order ${orderId}`,
      });

      await wallet.save();

      // Update the user's wallet balance
      const user = await User.findById(order.userId);
      if (user) {
        user.wallet += order.finalAmount;  // Increase the wallet balance
        await user.save();
        console.log("User wallet updated successfully:", user.wallet);
      }
    } else if (order.paymentStatus === "Refunded") {
      // Add refund amount to wallet if already refunded
      const wallet = new Wallet({
        userId: order.userId,
        amount: order.finalAmount,
        type: "Credit",
        description: `Refund for returned order ${orderId}`,
      });

      await wallet.save();

      // Update the user's wallet balance
      const user = await User.findById(order.userId);
      if (user) {
        user.wallet += order.finalAmount;  // Increase the wallet balance
        await user.save();
        console.log("User wallet updated successfully:", user.wallet);
      }
    }

    // Save the updated order with refund status
    await order.save();

    return res.json({ success: true, message: "Order marked as returned and refund processed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to process return and refund" });
  }
};

const getSalesReport = async (req, res) => {
  try {
    let matchCondition = {};
    let filter = req.query.filter || 'daily';
    let startDate = req.query.startDate || ''; // Default empty if not provided
    let endDate = req.query.endDate || '';

    let filterLabel = ' ';

    if (filter === 'daily') {
      matchCondition.invoiceDate = { $gte: moment().startOf('day').toDate() };
      filterLabel = 'Sales Report for Today';
    } else if (filter === 'weekly') {
      matchCondition.invoiceDate = { $gte: moment().startOf('week').toDate() };
      filterLabel = 'Sales Report for This Week';
    } else if (filter === 'monthly') {
      matchCondition.invoiceDate = { $gte: moment().startOf('month').toDate() };
      filterLabel = 'Sales Report for This Month';
    } else if (filter === 'custom') {
      if (startDate && endDate) {
        matchCondition.invoiceDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
        filterLabel = `Sales Report from ${startDate} to ${endDate}`;
      } else {
        filterLabel = 'Please provide a valid date range';
      }
    }

    const salesReport = await Order.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalPrice' },
          totalDiscount: { $sum: '$discount' },
          totalFinalAmount: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          totalCouponDiscount: { $sum: { $cond: [{ $eq: ['$couponApplied', true] }, '$discount', 0] } },
        },
      },
    ]);

    res.render('admin/salesreport', {
      salesReport: salesReport[0] || {}, // Ensure a fallback for empty reports
      filter,
      filterLabel,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error('Error generating sales report:', error);
    res.status(500).send('Internal Server Error');
  }
};


// Route to generate PDF report
const downloadSalesReportPDF = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    let matchCondition = {};

    // Filter based on date
    if (filter === 'daily') {
      matchCondition.invoiceDate = { $gte: moment().startOf('day').toDate() };
    } else if (filter === 'weekly') {
      matchCondition.invoiceDate = { $gte: moment().startOf('week').toDate() };
    } else if (filter === 'monthly') {
      matchCondition.invoiceDate = { $gte: moment().startOf('month').toDate() };
    } else if (filter === 'custom') {
      matchCondition.invoiceDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // MongoDB Aggregation pipeline to get sales data
    const salesReport = await Order.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalPrice' },
          totalDiscount: { $sum: '$discount' },
          totalFinalAmount: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          totalCouponDiscount: { $sum: { $cond: [{ $eq: ['$couponApplied', true] }, '$discount', 0] } },
        },
      },
    ]);

    const reportData = salesReport[0];
    const doc = new PDFDocument();
    const fileName = `sales-report-${moment().format('YYYY-MM-DD')}.pdf`;

    // Set headers for the response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Write PDF content
    doc.pipe(res);
    doc.fontSize(18).text('Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Date: ${moment().format('YYYY-MM-DD')}`);
    doc.moveDown();
    doc.text(`Total Sales: ₹${reportData.totalSales.toFixed(2)}`);
    doc.text(`Total Orders: ${reportData.totalOrders}`);
    doc.text(`Total Discount: ₹${reportData.totalDiscount.toFixed(2)}`);
    doc.text(`Total Coupon Discount: ₹${reportData.totalCouponDiscount.toFixed(2)}`);
    doc.text(`Total Final Amount: ₹${reportData.totalFinalAmount.toFixed(2)}`);

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Route to generate Excel report
const downloadSalesReportExcel = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    let matchCondition = {};

    // Filter based on date
    if (filter === 'daily') {
      matchCondition.invoiceDate = { $gte: moment().startOf('day').toDate() };
    } else if (filter === 'weekly') {
      matchCondition.invoiceDate = { $gte: moment().startOf('week').toDate() };
    } else if (filter === 'monthly') {
      matchCondition.invoiceDate = { $gte: moment().startOf('month').toDate() };
    } else if (filter === 'custom') {
      matchCondition.invoiceDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // MongoDB Aggregation pipeline to get sales data
    const salesReport = await Order.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalPrice' },
          totalDiscount: { $sum: '$discount' },
          totalFinalAmount: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          totalCouponDiscount: { $sum: { $cond: [{ $eq: ['$couponApplied', true] }, '$discount', 0] } },
        },
      },
    ]);

    const reportData = salesReport[0];

    // Create Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Add column headers
    worksheet.columns = [
      { header: 'Total Sales', key: 'totalSales', width: 20 },
      { header: 'Total Orders', key: 'totalOrders', width: 15 },
      { header: 'Total Discount', key: 'totalDiscount', width: 20 },
      { header: 'Total Coupon Discount', key: 'totalCouponDiscount', width: 25 },
      { header: 'Total Final Amount', key: 'totalFinalAmount', width: 20 },
    ];

    // Add data to the worksheet
    worksheet.addRow([
      `₹${reportData.totalSales.toFixed(2)}`,
      reportData.totalOrders,
      `₹${reportData.totalDiscount.toFixed(2)}`,
      `₹${reportData.totalCouponDiscount.toFixed(2)}`,
      `₹${reportData.totalFinalAmount.toFixed(2)}`,
    ]);

    // Set the file name
    const fileName = `sales-report-${moment().format('YYYY-MM-DD')}.xlsx`;

    // Set headers for the response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Write Excel file to the response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
  getOrderListPageAdmin,
  changeOrderStatus,
  getOrderDetailsPageAdmin,
  respondReturn,
  updateReturnStatus,
confirmReturnStatus,
completeReturn,
getSalesReport,
downloadSalesReportPDF,
  downloadSalesReportExcel,
}

