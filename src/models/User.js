import { Schema, model } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  favorites: [{ type: Schema.Types.ObjectId, ref: "Ad" }],
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  verificationAttempts: { type: Number, default: 0 },
  lastVerificationAttempt: Date,
  viewedHistory: [
    {
      // ad: { type: Schema.Types.ObjectId, ref: 'Ad' },
      category: { type: Schema.Types.ObjectId, ref: "Category" },
      location: { type: Schema.Types.ObjectId, ref: "Location" },
      viewedAt: { type: Date, default: Date.now },
    },
  ],
  rating: { type: Number, default: 0 },
  feedbacks: [
    {
      _id: { type: Schema.Types.ObjectId, auto: true },
      author: {
        _id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        name: { type: String, required: true },
      },
      text: { type: String, required: true },
      rating: { type: String, required: true }, // или Number
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

export default model("User", UserSchema);
