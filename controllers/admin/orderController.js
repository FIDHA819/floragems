const User = require("../../models/userschema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongodb = require("mongodb");
const PDFDocument = require('pdfkit');
const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');
const ExcelJS = require('exceljs');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose')
const env = require("dotenv").config();
const crypto = require("crypto");
const Razorpay=require("razorpay")
const Coupon=require("../../models/couponSchema");
const Notification=require("../../models/notificationSchema")
const Wallet = require("../../models/walletSchema");
const WalletTransaction=require("../../models/walletSchema");
pdfMake.vfs = pdfFonts.pdfMake.vfs;

let razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const { v4: uuidv4 } = require('uuid');
const objectId = new mongoose.Types.ObjectId(); 
const getOrderListPageAdmin = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 }).lean(); 


    for (let order of orders) {
      const userDetails = await User.findById(order.userId); 
      order.user = userDetails || null; 

      let shippingCost = order.totalPrice < 1000 ? 100 : 0; // Apply shipping cost if totalPrice > 1000


      let discount = order.discount || 0; 
      order.finalAmount = order.totalPrice + shippingCost - discount; 
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

    
    res.render("admin/order-list", { orders: currentOrder, totalPages, currentPage });
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};
const getOrderDetailsPageAdmin = async (req, res) => { 
  try {
    const orderId = req.query.orderId;
    if (!orderId) throw new Error("Order ID is required.");

    
    const findOrder = await Order.findOne({ orderId: orderId.toString() })
      .populate("orderedItems.product")
      .populate("userId")
      .lean();

    if (!findOrder) throw new Error("Order not found.");

    
    const address = findOrder.address;


    const totalGrant = findOrder.orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = totalGrant - findOrder.totalPrice;
    const finalAmount = findOrder.totalPrice;

    const userId = findOrder.userId._id; 

    const coupon = await Coupon.findOne({ userId: userId });

    const couponDiscount = coupon ? coupon.offerPrice || 0 : 0;

    const notifications = await Notification.find({ orderId: orderId });

    res.render("admin/order-details-admin", {
      orders: findOrder,
      orderId,
      finalAmount,
      discount: discount + couponDiscount,
      address: address,  
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


const getSalesReport = async (req, res) => {
  try {
    const { filter, startDate, endDate, format } = req.query;
    let matchCondition = {};
    let selectedFilter = filter || 'daily'; 

    if (filter === 'daily') {
      matchCondition.createdAt = { $gte: moment().startOf('day').toDate() };
    } else if (filter === 'weekly') {
      matchCondition.createdAt = { $gte: moment().startOf('week').toDate() };
    } else if (filter === 'monthly') {
      matchCondition.createdAt = { $gte: moment().startOf('month').toDate() };
    } else if (filter === 'yearly') {
      matchCondition.createdAt = { $gte: moment().startOf('year').toDate() };
    } else if (filter === 'custom') {
      matchCondition.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // MongoDB aggregation to fetch sales data
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

    if (!reportData) {
      if (format === 'pdf' || format === 'excel') {
        return res.status(404).send('No sales data found for the selected period.');
      }
      return res.render('admin/salesReport', {
        totalSales: 0,
        totalOrders: 0,
        totalDiscount: 0,
        totalCouponDiscount: 0,
        totalFinalAmount: 0,
        error: 'No sales data found for the selected period.',
        selectedFilter: selectedFilter, 
        startDate: startDate || '',    
        endDate: endDate || '' 
      });
    }

if (format === 'pdf') {
  // Generate and send PDF
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=Sales_Report.pdf');

  doc.pipe(res);

  doc.fontSize(18).text('Sales Report', { align: 'center' }).moveDown();
  doc.fontSize(12).text(`Filter: ${selectedFilter}`).moveDown();

  // Table headers
  const headers = ['Total Sales', 'Total Orders', 'Total Discount', 'Coupon Discount', 'Final Amount'];
  const values = [
    `Rs.${reportData.totalSales}`,
    `Rs.${reportData.totalOrders}`,
    `Rs.${reportData.totalDiscount}`,
    `Rs.${reportData.totalCouponDiscount}`,
    `Rs.${reportData.totalFinalAmount}`,
  ];

  // Table formatting
  const tableWidth = 500;
  const rowHeight = 20;
  const columnWidths = [tableWidth * 0.3, tableWidth * 0.2, tableWidth * 0.2, tableWidth * 0.2, tableWidth * 0.2];


  let yPosition = doc.y;

  
  doc.fontSize(12).font('Helvetica-Bold');
  doc.text(headers[0], 50, yPosition, { width: columnWidths[0], align: 'center' });
  doc.text(headers[1], 50 + columnWidths[0], yPosition, { width: columnWidths[1], align: 'center' });
  doc.text(headers[2], 50 + columnWidths[0] + columnWidths[1], yPosition, { width: columnWidths[2], align: 'center' });
  doc.text(headers[3], 50 + columnWidths[0] + columnWidths[1] + columnWidths[2], yPosition, { width: columnWidths[3], align: 'center' });
  doc.text(headers[4], 50 + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3], yPosition, { width: columnWidths[4], align: 'center' });
  
 
  yPosition += rowHeight;

  // Draw table row
  doc.fontSize(12).font('Helvetica');
  doc.text(values[0], 50, yPosition, { width: columnWidths[0], align: 'center' });
  doc.text(values[1], 50 + columnWidths[0], yPosition, { width: columnWidths[1], align: 'center' });
  doc.text(values[2], 50 + columnWidths[0] + columnWidths[1], yPosition, { width: columnWidths[2], align: 'center' });
  doc.text(values[3], 50 + columnWidths[0] + columnWidths[1] + columnWidths[2], yPosition, { width: columnWidths[3], align: 'center' });
  doc.text(values[4], 50 + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3], yPosition, { width: columnWidths[4], align: 'center' });

  
  yPosition += rowHeight;

  // Footer
  doc.moveDown();
 
const pageWidth = doc.page.width;

const footerText = `Generated on: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n\nThank you for choosing Floragems! Don't forget to check out your latest company reports.`;

const textWidth = doc.widthOfString(footerText);
const xPosition = (pageWidth - textWidth) / 2;

doc.text(footerText, xPosition, doc.y, { align: 'center' });

  doc.end();



    } else if (format === 'excel') {
      // Generate and send Excel
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sales Report');

      sheet.columns = [
        { header: 'Field', key: 'field', width: 25 },
        { header: 'Value', key: 'value', width: 25 },
      ];

      sheet.addRow({ field: 'Total Sales', value: `₹${reportData.totalSales}` });
      sheet.addRow({ field: 'Total Orders', value: reportData.totalOrders });
      sheet.addRow({ field: 'Total Discount', value: `₹${reportData.totalDiscount}` });
      sheet.addRow({ field: 'Coupon Discount', value: `₹${reportData.totalCouponDiscount}` });
      sheet.addRow({ field: 'Final Amount', value: `₹${reportData.totalFinalAmount}` });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Sales_Report.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } else {
      // Render the sales report page
      res.render('admin/salesReport', {
        totalSales: reportData.totalSales,
        totalOrders: reportData.totalOrders,
        totalDiscount: reportData.totalDiscount,
        totalCouponDiscount: reportData.totalCouponDiscount,
        totalFinalAmount: reportData.totalFinalAmount,
        error: null,
        selectedFilter: selectedFilter, 
          startDate: startDate || '',   
  endDate: endDate || '' 
      });
    }
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).send('Internal Server Error');
  }
};




const downloadSalesReportPDF = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    let matchCondition = {};

    // Apply date filters as per the user's selection
    if (filter === 'daily') {
      matchCondition.createdAt = { $gte: moment().startOf('day').toDate() };
    } else if (filter === 'weekly') {
      matchCondition.createdAt = { $gte: moment().startOf('week').toDate() };
    } else if (filter === 'monthly') {
      matchCondition.createdAt = { $gte: moment().startOf('month').toDate() };
    } else if (filter === 'yearly') {
      matchCondition.createdAt = { $gte: moment().startOf('year').toDate() };
    } else if (filter === 'custom') {
      matchCondition.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // MongoDB aggregation to fetch sales data
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

    if (!reportData) {
      return res.status(404).send('No sales data found for the selected period.');
    }

    // Create PDF document definition
    const docDefinition = {
      content: [
        { text: 'Sales Report', style: 'header' },
        { text: `Period: ${filter}`, style: 'subheader' },
        {
          table: {
            body: [
              ['Total Sales', `₹${reportData.totalSales.toFixed(2)}`],
              ['Total Orders', reportData.totalOrders],
              ['Total Discount', `₹${reportData.totalDiscount.toFixed(2)}`],
              ['Total Coupon Discount', `₹${reportData.totalCouponDiscount.toFixed(2)}`],
              ['Total Final Amount', `₹${reportData.totalFinalAmount.toFixed(2)}`],
            ],
          },
        },
      ],
      styles: {
        header: { fontSize: 18, bold: true },
        subheader: { fontSize: 14, italics: true },
      },
    };

    // Create PDF document
    const pdfDoc = pdfMake.createPdf(docDefinition);
    
    // Send PDF as a download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF report.');
  }
};

const downloadSalesReportExcel = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    let matchCondition = {};

    // Apply date filters as per the user's selection
    if (filter === 'daily') {
      matchCondition.createdAt = { $gte: moment().startOf('day').toDate() };
    } else if (filter === 'weekly') {
      matchCondition.createdAt = { $gte: moment().startOf('week').toDate() };
    } else if (filter === 'monthly') {
      matchCondition.createdAt = { $gte: moment().startOf('month').toDate() };
    } else if (filter === 'yearly') {
      matchCondition.createdAt = { $gte: moment().startOf('year').toDate() };
    } else if (filter === 'custom') {
      matchCondition.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // MongoDB aggregation to fetch sales data
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

    if (!reportData) {
      return res.status(404).send('No sales data found for the selected period.');
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Add header row
    worksheet.addRow(['Total Sales', 'Total Orders', 'Total Discount', 'Total Coupon Discount', 'Total Final Amount']);
    
    // Add data row
    worksheet.addRow([
      `₹${reportData.totalSales.toFixed(2)}`,
      reportData.totalOrders,
      `₹${reportData.totalDiscount.toFixed(2)}`,
      `₹${reportData.totalCouponDiscount.toFixed(2)}`,
      `₹${reportData.totalFinalAmount.toFixed(2)}`
    ]);

    // Set the response headers for Excel file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');

    // Write Excel file to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).send('Error generating Excel report.');
  }
};

const changeOrderStatus = async (req, res) => {
  try {
    const { orderId, status, itemId } = req.query;

    // List of valid statuses
    const validStatuses = [
      "Pending", "Processing", "Shipped", "Delivered", "Cancelled",
      "Return Request", "Returned"
    ];

    // Validate the status
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ status: false, message: "Invalid status" });
    }

    // Find the order
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }
    if (!order.orderedItems || order.orderedItems.length === 0) {
      return res.status(400).json({ status: false, message: "No items found in the order" });
    }
    
    if (itemId) {
      // Update specific item's status
      const item = order.orderedItems.find((item) => item._id.toString() === itemId);
      if (!item) {
        return res.status(404).json({ status: false, message: "Item not found in the order" });
      }
      item.status = status;
    } else {
      // Update all items' statuses
      order.orderedItems.forEach((item) => {
        item.status = status;
      });
    }
    

    // Update the order status
    order.orderStatus = status;
    await order.save();

    return res.status(200).json({ status: true, message: "Status updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred" });
  }
};
const updateItemStatus=async (req, res) => {
  const { itemId, status, orderId } = req.query;

  if (!itemId || !status || !orderId) {
    return res.status(400).json({ status: false, message: 'Missing required parameters' });
  }

  try {
    // Find the order by orderId
    const order = await Order.findOne({orderId:orderId});
    if (!order) {
      return res.status(404).json({ status: false, message: 'Order not found' });
    }

    // Find the item in the order by itemId
    const item = order.orderedItems.find(item => item._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ status: false, message: 'Item not found' });
    }
   
    // Update the return status of the item
    item.status = status;
    item.paymentStatus = 'Refunded';
   // Update the return status field for the item
    // Refund the amount to the user's wallet balance
    const user = await User.findById(order.userId);
    if (!user) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }

    const refundAmount = item.price * item.quantity;  // Assuming item price * quantity is the total refund amount
    user.wallet += refundAmount;
    await user.save();

    // Create a new wallet transaction for the refund
    const walletTransaction = new WalletTransaction({
      userId: user._id,
      amount: refundAmount,
      type: 'Credit',  // Refund is a credit to the user's wallet
      description: `Refund for item in order ${orderId}`,
      source: 'Refund',
    });

    await walletTransaction.save();
  

  // Save the updated order with the new item status and payment status
  await order.save();

   
    // Respond with a success message
    res.json({ status: true, message: 'Item return status updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: 'An error occurred while updating item return status' });
  }
}

const rejectReturnRequest = async (req, res) => {
  const { itemId, orderId, reason } = req.body;

  try {
   
    const order = await Order.findOne({ orderId });

      if (!order) return res.status(404).json({ message: 'Order not found' });

      const item = order.orderedItems.find(item => item._id.toString() === itemId);
      if (!item) return res.status(404).json({ message: 'Item not found' });


      item.status = 'Rejected';
      item.returnReason = reason;

      await order.save();

     

      return res.status(200).json({ status: true, message: 'Return request rejected' });
  } catch (err) {
      console.error(err);
      return res.status(500).json({ status: false, message: 'Error rejecting return request' });
  }
};

module.exports = {
  getOrderListPageAdmin,
  getOrderDetailsPageAdmin,

getSalesReport,
downloadSalesReportPDF,
  downloadSalesReportExcel,
  changeOrderStatus,
  updateItemStatus,
  rejectReturnRequest

  
}

