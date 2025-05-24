import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: Map,
      of: String,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Category", categorySchema);
