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
const WalletTransaction=require("../../models/walletSchema");


const getDashboardStats = async (req, res) => {
    try {
      // Total Orders
      const totalOrders = await Order.countDocuments();
  
      // Total Deliveries
      const totalDeliveries = await Order.countDocuments({ orderStatus: "Delivered" });
  
      // Total Products
      const totalProducts = await Product.countDocuments();
  
      // New Customers (Registered within the last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newCustomers = await User.countDocuments({ createdOn: { $gte: thirtyDaysAgo } });
  
      // Send the stats to the frontend
      res.json({
        totalOrders,
        totalDeliveries,
        totalProducts,
        newCustomers,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  }
  const getTopProducts = async (req, res) => {
    try {
      // Fetch all orders and populate the orderedItems.product field
      const orders = await Order.find().populate("orderedItems.product");
  
      // Create an object to store the popularity of each product
      const productPopularity = {};
  
      // Loop through each order and each ordered item to calculate popularity
      orders.forEach(order => {
        order.orderedItems.forEach(item => {
          // Check if product exists before accessing _id
          if (item.product && item.product._id) {
            const productId = item.product._id.toString();
            if (productPopularity[productId]) {
              productPopularity[productId].popularity += item.quantity;
            } else {
              productPopularity[productId] = {
                productName: item.product.productName,
                popularity: item.quantity,
              };
            }
          }
        });
      });
  
      // Convert the object into an array and sort by popularity in descending order
      const topProducts = Object.values(productPopularity)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 5); // Top 5 products
  
      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).send("Server error");
    }
  };
  
  const getCustomerFulfillment = async (req, res) => {
    try {
      // Count the number of orders for each status
      const orderStatuses = ["Delivered", "Pending", "Cancelled"];
      const statusCounts = {};
  
      for (const status of orderStatuses) {
        const count = await Order.countDocuments({ orderStatus: status });
        statusCounts[status] = count;
      }
  
      res.json(statusCounts); // Send status counts to frontend
    } catch (error) {
      console.error("Error fetching customer fulfillment data:", error);
      res.status(500).send("Server error");
    }
  };

  const getEarnings = async (req, res) => {
    try {
      // Calculate total earnings from completed or paid orders
      const earnings = await Order.aggregate([
        {
          $match: {
            $or: [
              { orderStatus: "Delivered" }, // Completed orders
              { paymentStatus: "Confirmed" },    // Paid orders
            ]
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$finalAmount" } // Sum of finalAmount for all qualifying orders
          }
        }
      ]);
  
      // If earnings data is found, return it; otherwise, return 0
      const totalEarnings = earnings.length > 0 ? earnings[0].totalEarnings : 0;
      res.json({ totalEarnings });
    } catch (error) {
      console.error("Error fetching earnings:", error);
      res.status(500).send("Server error");
    }
  };

  const getInsights = async (req, res) => {
    try {
      const { filter } = req.query; // Get the filter from query params
  
      // Determine the date range based on the filter
      let startDate;
      const today = new Date();
  
      switch (filter) {
        case "daily":
          startDate = new Date(today.setHours(0, 0, 0, 0)); // Reset time to start of the day
          break;
        case "weekly":
          startDate = new Date(today.setDate(today.getDate() - 7)); // 7 days ago
          break;
        case "monthly":
          startDate = new Date(today.setMonth(today.getMonth() - 1)); // 1 month ago
          break;
        case "yearly":
          startDate = new Date(today.setFullYear(today.getFullYear() - 1)); // 1 year ago
          break;
        default:
          startDate = new Date(today.setHours(0, 0, 0, 0)); // Default to daily
      }
  
      // Query orders based on the date range and group by orderStatus
      const insights = await Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } }, // Match orders within the date range
        {
          $group: {
            _id: "$orderStatus", // Group by order status
            count: { $sum: 1 },  // Count the number of orders for each status
          },
        },
        {
          $project: {
            _id: 0,    // Remove the _id field
            status: "$_id", // Rename _id to status
            count: 1,  // Keep the count field
          },
        },
      ]);
  
      // Initialize counts for statuses
      const counts = {
        cancelled: 0,
        delivered: 0,
        returned: 0,
      };
  
      // Populate counts based on the aggregation results
      insights.forEach(item => {
        if (item.status === "Cancelled") counts.cancelled = item.count;
        if (item.status === "Delivered") counts.delivered = item.count;
        if (item.status === "Returned") counts.returned = item.count;
      });
  
      res.json(counts); // Send the counts back to the client
    } catch (error) {
      console.error("Error fetching insights:", error);
      res.status(500).send("Server error");
    }
  };
 const customers=async function getCustomers(req, res) {
    try {
      // Get the customers with their order count
      const customers = await User.aggregate([
        {
          $lookup: {
            from: "orders", // Assuming "orders" is your order collection
            localField: "_id",
            foreignField: "userId", // Assuming orders have a userId field
            as: "orders"
          }
        },
        {
          $addFields: {
            orderCount: { $size: "$orders" } // Calculate the number of orders for each user
          }
        },
        {
          $project: {
            name: 1, // Include name field
            email: 1, // Include email field
            orderCount: 1 // Include order count field
          }
        }
      ]);
  
      res.render("admin/admin-dashboard", { customers }); // Pass customers to your view
    } catch (error) {
      console.error(error);
      res.status(500).send("Error fetching customers");
    }
  }


  const getGraphData = async () => {
    try {
      // Aggregate orders to get the total discount, coupon used, and referral join data
      const data = await Order.aggregate([
        {
          $lookup: {
            from: 'users', // Join with the 'users' collection
            localField: 'userId',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        {
          $unwind: '$userDetails' // Unwind the userDetails array
        },
        {
          $group: {
            _id: '$userDetails.referralCode', // Group by referral code
            totalDiscount: { $sum: '$discount' }, // Sum up all discounts
            totalCouponUsed: { $sum: { $cond: [{ $gt: ['$discount', 0] }, 1, 0] } }, // Count of coupon usage
            totalReferralJoins: { $sum: { $cond: [{ $ne: ['$userDetails.referralCode', null] }, 1, 0] } } // Count of referral joins
          }
        },
        {
          $project: {
            _id: 0,
            referralCode: '$_id',
            totalDiscount: 1,
            totalCouponUsed: 1,
            totalReferralJoins: 1
          }
        }
      ]);
  
      return data;
    } catch (error) {
      throw new Error(`Error fetching graph data: ${error.message}`);
    }
  };
  
  const getSalesGragh = async (req, res) => {
    try {
      const { filter, startDate, endDate, format } = req.query;
      let matchCondition = {};
      let selectedFilter = filter || 'daily'; // Default to 'daily' if no filter is provided
  
      // Apply date filters based on createdAt
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
        return res.status(404).json({ error: 'No sales data found for the selected period.' });
      }
  
      // Return sales data in JSON format for frontend
      return res.json({
        totalSales: reportData.totalSales,
        totalOrders: reportData.totalOrders,
        totalDiscount: reportData.totalDiscount,
        totalCouponDiscount: reportData.totalCouponDiscount,
        totalFinalAmount: reportData.totalFinalAmount,
        selectedFilter,
        startDate: startDate || '',
        endDate: endDate || ''
      });
    } catch (error) {
      console.error('Error fetching sales report:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
  
  module.exports={
    getDashboardStats,
    getTopProducts,
    getCustomerFulfillment,
    getEarnings,
    getInsights,
    getGraphData,
    getSalesGragh,

   customers
  }