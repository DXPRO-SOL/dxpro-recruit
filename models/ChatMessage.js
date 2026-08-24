const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema({
  applicationId: { type: String, required: true },
  applicationType: { type: String, enum: ["newgrad", "career"], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ["user", "admin"], required: true },
  message: { type: String, default: "" },
  read: { type: Boolean, default: false },
  // 添付ファイル
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  fileType: { type: String, default: null }, // "image" | "file"
  // いいね
  likes: [{ userId: String, userName: String }],
  // 編集・削除
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
