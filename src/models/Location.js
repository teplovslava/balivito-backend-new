import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: Map,
      of: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Location", locationSchema);
