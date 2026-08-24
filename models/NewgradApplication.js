// models/NewgradApplication.js
const mongoose = require("mongoose");

const NewgradApplicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // 基本情報
  lastName: { type: String, required: true },
  firstName: { type: String, required: true },
  hurilastName: { type: String, required: true },
  hurifirstName: { type: String, required: true },
  birthdate: { type: Date },
  phone: { type: String, required: true },
  gender: { type: String, enum: ["男性", "女性"] },
  email: { type: String, required: true },

  // 住所
  postalCode: { type: String },
  prefecture: { type: String },
  city: { type: String },
  addressDetail: { type: String },
  noAddress: { type: Boolean, default: false },

  // 学歴
  education: { type: String, enum: ["高卒","専門卒","大卒","大学院卒"] },
  major: { type: String },
  graduation: { type: String }, // YYYY-MM形式

  // 希望
  position: { type: String, enum: ["frontend","backend","designer"], required: true },
  locationPreference: { type: String, enum: ["出社","リモート"] },

  // 添付資料
  resume: { type: String }, // 파일 경로 (旧)
  portfolioFiles: [String], // 파일 경로 배열 (旧)
  portfolio: { type: String }, // GitHub / URL
  // MongoDB保存ファイルID（新方式）
  resumeFileId: { type: mongoose.Schema.Types.ObjectId, ref: "FileStore", default: null },
  resumeFileName: { type: String },
  portfolioFileIds: [{ fileId: { type: mongoose.Schema.Types.ObjectId, ref: "FileStore" }, fileName: String }],

  // 自己PR
  pr: { type: String },
  motivation: { type: String },

  // 選考ステージ
  status: { type: String, default: null },

  // 동의
  consent: { type: Boolean, required: true }
}, { timestamps: true });


const chatSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

NewgradApplicationSchema.add({ chat: [chatSchema] });

module.exports = mongoose.model("NewgradApplication", NewgradApplicationSchema);
