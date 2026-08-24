// models/CareerApplication.js
const mongoose = require("mongoose");

const CareerApplicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // 基本情報
  lastName: { type: String, required: true },
  firstName: { type: String, required: true },
  hurilastName: { type: String, required: true },
  hurifirstName: { type: String, required: true },
  birthdate: { type: Date },
  phone: { type: String, required: true },
  gender: { type: String, enum: ["男性","女性"] },
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

  // 現職情報
  currentCompany: { type: String },
  currentPosition: { type: String },
  currentJobDescription: { type: String },
  experienceYears: { type: Number },

  // 希望条件
  position: { type: String, enum: ["frontend","backend","designer","pm","consultant","qaengineer"], required: true },
  locationPreference: { type: String, enum: ["出社","リモート"] },
  gold: { type: String }, // 希望年収

  // 添付資料
  career: { type: String }, // 職務経歴書
  resume: { type: String },
  portfolioFiles: [String], // 複数ファイル
  portfolio: { type: String }, // GitHub / URL

  // 自己PR
  pr: { type: String },
  changeReason: { type: String }, // 転職理由
  desiredJoinDate: { type: String, enum: ["即日","１ヶ月以内", "２ヶ月以内"] }, // 希望入社時期

  // 同意
  consent: { type: Boolean, required: true }

}, { timestamps: true });

const chatSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

CareerApplicationSchema.add({ chat: [chatSchema] });

module.exports = mongoose.model("CareerApplication", CareerApplicationSchema);
