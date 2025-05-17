import { Schema, model } from 'mongoose';

const UserSchema = new Schema(
  {
    name:      { type: String, required: true },
    email:     { type: String, required: true, unique: true },
    password:  { type: String, required: true },

    /* --- новый блок рейтинга --- */
    rating:        { type: Number, default: 0 },     // средний балл
    reviewsCount:  { type: Number, default: 0 },     // всего отзывов

    /* остальное как было ↓ */
    favorites:   [{ type: Schema.Types.ObjectId, ref: 'Ad' }],
    isVerified:  { type: Boolean, default: false },
    expoPushToken: String,
  },
  { timestamps: true }
);

export default model('User', UserSchema);
