const mongoose = require("mongoose");


const NotificationSchema = new mongoose.Schema({
    type: { type: String, required: true }, // e.g., "Return Request"
    message: { type: String, required: true },
    orderId: { type: String, ref: "Order" },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
});


const Notification = mongoose.model("Notification", NotificationSchema);
module.exports=Notification;