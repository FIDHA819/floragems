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
    
      const totalOrders = await Order.countDocuments();
 
      const totalDeliveries = await Order.countDocuments({ orderStatus: "Delivered" });
  
      const totalProducts = await Product.countDocuments();
  
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newCustomers = await User.countDocuments({ createdOn: { $gte: thirtyDaysAgo } });
  
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

      const orders = await Order.find().populate("orderedItems.product");

      const productPopularity = {};

      orders.forEach(order => {
        order.orderedItems.forEach(item => {
 
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
  
      const topProducts = Object.values(productPopularity)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 5); 
  
      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).send("Server error");
    }
  };
  
  const getCustomerFulfillment = async (req, res) => {
    try {

      const orderStatuses = ["Delivered", "Pending", "Cancelled"];
      const statusCounts = {};
  
      for (const status of orderStatuses) {
        const count = await Order.countDocuments({ orderStatus: status });
        statusCounts[status] = count;
      }
  
      res.json(statusCounts);
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
              { orderStatus: "Delivered" }, 
              { paymentStatus: "Confirmed" },    
            ]
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$finalAmount" } 
          }
        }
      ]);
  

      const totalEarnings = earnings.length > 0 ? earnings[0].totalEarnings : 0;
      res.json({ totalEarnings });
    } catch (error) {
      console.error("Error fetching earnings:", error);
      res.status(500).send("Server error");
    }
  };

  const getInsights = async (req, res) => {
    try {
      const { filter } = req.query; 
  
      // Determine the date range based on the filter
      let startDate;
      const today = new Date();
  
      switch (filter) {
        case "daily":
          startDate = new Date(today.setHours(0, 0, 0, 0)); 
          break;
        case "weekly":
          startDate = new Date(today.setDate(today.getDate() - 7));
        case "monthly":
          startDate = new Date(today.setMonth(today.getMonth() - 1));
          break;
        case "yearly":
          startDate = new Date(today.setFullYear(today.getFullYear() - 1)); 
          break;
        default:
          startDate = new Date(today.setHours(0, 0, 0, 0)); 
      }
  
      const insights = await Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } }, 
        {
          $group: {
            _id: "$orderStatus", 
            count: { $sum: 1 },  
          },
        },
        {
          $project: {
            _id: 0,    
            status: "$_id", 
            count: 1, 
          },
        },
      ]);
  
  
      const counts = {
        cancelled: 0,
        delivered: 0,
        returned: 0,
      };
  
      insights.forEach(item => {
        if (item.status === "Cancelled") counts.cancelled = item.count;
        if (item.status === "Delivered") counts.delivered = item.count;
        if (item.status === "Returned") counts.returned = item.count;
      });
  
      res.json(counts); 
    } catch (error) {
      console.error("Error fetching insights:", error);
      res.status(500).send("Server error");
    }
  };
 const customers=async function getCustomers(req, res) {
    try {
     
      const customers = await User.aggregate([
        {
          $lookup: {
            from: "orders", 
            localField: "_id",
            foreignField: "userId", 
            as: "orders"
          }
        },
        {
          $addFields: {
            orderCount: { $size: "$orders" } 
          }
        },
        {
          $project: {
            name: 1, 
            email: 1, 
            orderCount: 1 
          }
        }
      ]);
  
      res.render("admin/admin-dashboard", { customers }); 
    } catch (error) {
      console.error(error);
      res.status(500).send("Error fetching customers");
    }
  }


  const getGraphData = async () => {
    try {
  
      const data = await Order.aggregate([
        {
          $lookup: {
            from: 'users', 
            localField: 'userId',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        {
          $unwind: '$userDetails'
        },
        {
          $group: {
            _id: '$userDetails.referralCode', 
            totalDiscount: { $sum: '$discount' }, 
            totalCouponUsed: { $sum: { $cond: [{ $gt: ['$discount', 0] }, 1, 0] } }, 
            totalReferralJoins: { $sum: { $cond: [{ $ne: ['$userDetails.referralCode', null] }, 1, 0] } } 
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
      let selectedFilter = filter || 'daily'; 
  
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