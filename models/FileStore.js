const mongoose = require("mongoose");

const FileStoreSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  data: { type: Buffer, required: true },
  size: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model("FileStore", FileStoreSchema);
