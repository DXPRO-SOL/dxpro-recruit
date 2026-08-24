const mongoose = require("mongoose");

const StageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String, default: "gray" }, // gray, blue, yellow, orange, purple, green, red, pink
  order: { type: Number, default: 0 },
  isRejection: { type: Boolean, default: false }
}, { _id: false });

const PipelineSettingSchema = new mongoose.Schema({
  stages: { type: [StageSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model("PipelineSetting", PipelineSettingSchema);
