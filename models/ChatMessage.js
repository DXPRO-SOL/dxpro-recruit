const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema({
  applicationId: { type: String, required: true }, // 응모ID (NewgradApplication or CareerApplication)
  applicationType: { type: String, enum: ["newgrad", "career"], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ["user", "admin"], required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
