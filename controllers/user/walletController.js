const WalletTransaction = require("../../models/walletSchema"); // Assuming transactions are stored here
const Order = require("../../models/orderSchema");
const User = require("../../models/userschema");

// Get Wallet Page
const getWalletPage = async (req, res) => {
  try {
    const user = req.user;  
    if (!user) {
      return res.status(400).json({ message: 'User not found or not authenticated' });
    }

    
    const walletTransactions = await WalletTransaction.find({ userId: user._id })
      .populate('userId', 'name email') 
      .sort({ createdAt: -1 });

    
    const walletBalance = walletTransactions.reduce((acc, txn) => {
      if (txn.type === "Credit") {
        return acc + txn.amount; 
      } else if (txn.type === "Debit") {
        return acc - txn.amount; 
      }
      return acc;
    }, 0);

    // Render wallet page with data
    res.render("user/walletPage", {
      walletBalance: walletBalance.toFixed(2), 
      transactions: walletTransactions,
    });
  } catch (error) {
    console.error("Error fetching wallet details:", error);
    res.status(500).send("Internal Server Error");
  }
};
const refundToWallet = async (orderId) => {
  try {
    const order = await Order.findById(orderId).populate("userId");

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.paymentStatus === "Refunded") {
      console.log(`Refund already processed for Order ${order.orderId}`);
      return;
    }

    const refundAmount = order.finalAmount;
    const description = `Refund for Order ${order.orderId}`;

    const walletTransaction = new WalletTransaction({
      userId: order.userId._id,
      amount: refundAmount,
      description,
      status: "Success",
      type: "Credit",
    });

    await walletTransaction.save();
    await User.updateOne({ _id: order.userId._id }, { $inc: { wallet: refundAmount } });

    const user = await User.findById(order.userId._id);
    console.log("Fetched User:", user);  // Check if user is fetched properly
    if (user) {
      console.log("User Wallet Before Update:", user.wallet);
      user.wallet += refundAmount;
      console.log("User Wallet After Update:", user.wallet);
      await user.save();
    } else {
      console.log("User not found for the given userId:", order.userId._id);
    }
    

    order.paymentStatus = "Refunded";
    await order.save();

    console.log(`Refund of ₹${refundAmount} credited to wallet for Order ${order.orderId}`);
  } catch (error) {
    console.error("Error processing refund:", error);
  }
};

module.exports = {
  getWalletPage,
  refundToWallet,
};
