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
const Razorpay = require("razorpay")
const Coupon = require("../../models/couponSchema");
const Notification = require("../../models/notificationSchema")
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletSchema");
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

      let shippingCost = order.totalPrice < 1000 ? 100 : 0;


      let discount = order.discount || 0;
      order.finalAmount = order.totalPrice + shippingCost - discount;

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
      let { filter, startDate, endDate, page = 1 } = req.query;
      let query = {};
      let now = new Date();

      if (filter === "daily") {
          query.createdAt = {
              $gte: new Date(now.setHours(0, 0, 0, 0)),
              $lt: new Date(now.setHours(23, 59, 59, 999))
          };
      } else if (filter === "weekly") {
          let weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
          let weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          query.createdAt = { $gte: weekStart, $lt: weekEnd };
      } else if (filter === "monthly") {
          query.createdAt = {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1),
              $lt: new Date(now.getFullYear(), now.getMonth() + 1, 0)
          };
      } else if (filter === "yearly") {
          query.createdAt = {
              $gte: new Date(now.getFullYear(), 0, 1),
              $lt: new Date(now.getFullYear(), 11, 31)
          };
      } else if (filter === "custom" && startDate && endDate) {
          query.createdAt = {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
          };
      }

      let perPage = 10;
      let orders = await Order.find(query)
          .populate("userId")
          .skip((page - 1) * perPage)
          .limit(perPage)
          .lean();

      let totalOrders = await Order.countDocuments(query);
      let totalPages = Math.ceil(totalOrders / perPage);

      let totalSales = orders.reduce((acc, order) => acc + order.totalPrice, 0);
      let totalFinalAmount = orders.reduce((acc, order) => acc + order.finalAmount, 0);
      let totalDiscount = totalSales - totalFinalAmount;
      let totalCouponDiscount = orders.reduce((acc, order) => acc + (order.couponDiscount || 0), 0);

      res.render("admin/salesReport", {
          orders,
          totalOrders,
          totalPages,
          currentPage: page,
          totalSales,
          totalFinalAmount,
          totalDiscount,
          totalCouponDiscount,
          filter,
          startDate,
          endDate
      });
  } catch (error) {
      console.log(error);
      res.status(500).send("Server Error");
  }
};


const downloadSalesReportPDF = async (req, res) => {
    try {
        const { filter, startDate, endDate } = req.query;
        let query = {};
console.log(req.query)
        // Filter Logic
        if (filter) {
            const today = new Date();
            switch (filter) {
                case "daily":
                    query.createdAt = {
                        $gte: new Date(today.setHours(0, 0, 0, 0)),
                        $lt: new Date(today.setHours(23, 59, 59, 999)),
                    };
                    break;
                case "weekly":
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    query.createdAt = { $gte: weekAgo };
                    break;
                case "monthly":
                    const monthAgo = new Date();
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    query.createdAt = { $gte: monthAgo };
                    break;
                case "custom":
                    if (startDate && endDate) {
                        query.createdAt = {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate),
                        };
                    }
                    break;
            }
        }

        const orders = await Order.find(query).populate("userId").lean();

        // Create PDF Document
        const doc = new PDFDocument({
            margin: 40,
            size: "A4",
            bufferPages: true,
        });

        const filePath = path.join(__dirname, "../../public/mail/salesReport.pdf");
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Styling Configuration
        const styles = {
            header: { fontSize: 20, color: "#b46e59" },
            tableHeader: { fontSize: 10, font: "Helvetica-Bold" },
            tableCell: { fontSize: 9, font: "Helvetica" },
            footer: { fontSize: 8, font: "Helvetica" },
        };

        const generationTime = new Date().toLocaleString("en-US", {
            dateStyle: "full",
            timeStyle: "long",
        });

        // Header Section
        doc.fontSize(styles.header.fontSize)
            .fillColor(styles.header.color)
            .text("Floragems Sales Report", { align: "center", underline: true })
            .moveDown(0.5);

        // Generation Time and Report Info
        doc.fontSize(styles.tableCell.fontSize)
            .fillColor("black")
            .text(`Generated on: ${generationTime}`, { align: "center" })
            .text(`Report Period: ${filter || "All Time"}`, { align: "center" });

        if (startDate && endDate) {
            doc.text(
                `Date Range: ${new Date(startDate).toLocaleDateString()} - ${new Date(
                    endDate
                ).toLocaleDateString()}`,
                { align: "center" }
            );
        }

        doc.moveDown(1);

        // Table Headers
        const headers = [
            "Order ID",
            "User",
            "Email",
            "Total Price",
            "Final Amount",
            "Payment",
            "Status",
            "Date",
        ];
        const columnWidths = [70, 65, 110, 65, 65, 65, 65, 65];
        const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
        const startX = (doc.page.width - tableWidth) / 2;
        let y = doc.y;

        // Add Footer Function
        const addFooter = (doc) => {
          const footerTop = doc.y + 20;
          if (footerTop > doc.page.height - 40) {
            doc.addPage();
        }
    
        doc.text(`Page ${doc.bufferedPageRange().start + 1} of ${doc.bufferedPageRange().count}`, 40, footerTop + 12, {
          align: "center",
      });
            doc.fontSize(styles.footer.fontSize)
                .fillColor("#666666")
                .text("Floragems | www.floragems.com | contact@floragems.com", 40, footerTop, {
                    width: doc.page.width - 80,
                    align: "center",
                });

            const pageNumber = doc.bufferedPageRange().start + 1;
            doc.text(`Page ${pageNumber} of ${doc.bufferedPageRange().count}`, 40, footerTop + 12, {
                align: "center",
            });
        };

        // Draw Table Headers
        doc.font(styles.tableHeader.font).fontSize(styles.tableHeader.fontSize);
        let x = startX;
        headers.forEach((header, i) => {
            doc.text(header, x, y, {
                width: columnWidths[i],
                align: "center",
            });
            x += columnWidths[i];
        });

        // Header Separator
        y += 12;
        doc.moveTo(startX, y)
            .lineTo(startX + tableWidth, y)
            .strokeColor("#dddddd")
            .stroke();
        y += 5;

        // Table Rows
        doc.font(styles.tableCell.font).fontSize(styles.tableCell.fontSize);
        orders.forEach((order) => {
            if (y > doc.page.height - 90) {
                addFooter(doc);
                doc.addPage();
                y = 40;
            }

            const row = [
                order._id.toString().slice(-8),
                order.userId?.name || "Guest",
                order.userId?.email || "N/A",
                `Rs${order.totalPrice.toFixed(2)}`,
                `Rs${order.finalAmount.toFixed(2)}`,
                order.paymentMethod,
                order.orderStatus,
                new Date(order.createdAt).toLocaleDateString(),
            ];

            x = startX;
            row.forEach((text, i) => {
                doc.text(text, x, y, {
                    width: columnWidths[i],
                    align: "center",
                    lineBreak: false,
                });
                x += columnWidths[i];
            });

            y += 10; // Reduced spacing
            doc.moveTo(startX, y)
                .lineTo(startX + tableWidth, y)
                .strokeColor("#dddddd")
                .stroke();
            y += 5;
        });

        // Summary Section
        const totalAmount = orders.reduce((sum, order) => sum + order.finalAmount, 0);
        const summaryBoxWidth = 200;
        const summaryBoxX = (doc.page.width - summaryBoxWidth) / 2;

        if (y > doc.page.height - 100) {
            addFooter(doc);
            doc.addPage();
            y = 40;
        }

        doc.rect(summaryBoxX, y + 10, summaryBoxWidth, 50).stroke();
        doc.fontSize(styles.tableHeader.fontSize)
            .text("Summary", summaryBoxX, y + 20, { width: summaryBoxWidth, align: "center" })
            .fontSize(styles.tableCell.fontSize)
            .text(`Total Orders: ${orders.length}`, {
                width: summaryBoxWidth,
                align: "center",
            })
            .text(`Total Revenue: Rs${totalAmount.toFixed(2)}`, {
                width: summaryBoxWidth,
                align: "center",
            });

        // Final Footer
        addFooter(doc);
        doc.end();

        stream.on("finish", () => {
            const fileName = `Floragems_Sales_Report_${filter || "all"}_${new Date()
                .toISOString()
                .split("T")[0]}.pdf`;
            res.download(filePath, fileName, (err) => {
                if (err) console.error(err);
                fs.unlinkSync(filePath);
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error generating PDF");
    }
};

// Generate Excel Report
const downloadSalesReportExcel = async (req, res) => {
  try {
      const { startDate, endDate, paymentMethod, orderStatus } = req.query;
      let query = {};
      if (startDate && endDate) {
          query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }
      if (paymentMethod) query.paymentMethod = paymentMethod;
      if (orderStatus) query.orderStatus = orderStatus;

      const orders = await Order.find(query).populate("userId", "name email").sort({ createdAt: -1 });
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");

      worksheet.columns = [
          { header: "Order ID", key: "orderId", width: 20 },
          { header: "User", key: "user", width: 25 },
          { header: "Email", key: "email", width: 30 },
          { header: "Total Price", key: "totalPrice", width: 15 },
          { header: "Final Amount", key: "finalAmount", width: 15 },
          { header: "Payment Method", key: "paymentMethod", width: 15 },
          { header: "Order Status", key: "orderStatus", width: 15 },
          { header: "Date", key: "date", width: 15 }
      ];

      orders.forEach(order => {
          worksheet.addRow({
              orderId: order._id,
              user: order.userId?.name || "Guest",
              email: order.userId?.email || "N/A",
              totalPrice: `₹${order.totalPrice || 0}`,
              finalAmount: `₹${order.finalAmount || 0}`,
              paymentMethod: order.paymentMethod,
              orderStatus: order.orderStatus,
              date: new Date(order.createdAt).toLocaleDateString()
          });
      });

      const timestamp = new Date().getTime();
      const filePath = path.join(__dirname, `../public/reports/sales_report_${timestamp}.xlsx`);
      await workbook.xlsx.writeFile(filePath);
      res.download(filePath);
  } catch (error) {
      console.error("Error generating Excel:", error);
      res.status(500).json({ success: false, message: "Error generating Excel" });
  }
};
const changeOrderStatus = async (req, res) => {
  try {
    const { orderId, status, itemId } = req.query;


    const validStatuses = [
      "Pending", "Processing", "Shipped", "Delivered", "Cancelled",
      "Return Request", "Returned"
    ];


    if (!validStatuses.includes(status)) {
      return res.status(400).json({ status: false, message: "Invalid status" });
    }


    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }
    if (!order.orderedItems || order.orderedItems.length === 0) {
      return res.status(400).json({ status: false, message: "No items found in the order" });
    }

    if (itemId) {

      const item = order.orderedItems.find((item) => item._id.toString() === itemId);
      if (!item) {
        return res.status(404).json({ status: false, message: "Item not found in the order" });
      }
      item.status = status;
    } else {

      order.orderedItems.forEach((item) => {
        item.status = status;
      });
    }



    order.orderStatus = status;
    await order.save();

    return res.status(200).json({ status: true, message: "Status updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred" });
  }
};
const updateItemStatus = async (req, res) => {
  const { itemId, status, orderId } = req.query;

  if (!itemId || !status || !orderId) {
    return res.status(400).json({ status: false, message: 'Missing required parameters' });
  }

  try {

    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ status: false, message: 'Order not found' });
    }


    const item = order.orderedItems.find(item => item._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ status: false, message: 'Item not found' });
    }


    item.status = status;
    item.paymentStatus = 'Refunded';

    const user = await User.findById(order.userId);
    if (!user) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }

    const refundAmount = item.price * item.quantity;
    user.wallet += refundAmount;
    await user.save();

    // Create a new wallet transaction for the refund
    const walletTransaction = new WalletTransaction({
      userId: user._id,
      amount: refundAmount,
      type: 'Credit',
      description: `Refund for item in order ${orderId}`,
      source: 'Refund',
    });

    await walletTransaction.save();


    await order.save();



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

