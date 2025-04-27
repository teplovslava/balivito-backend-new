import { Schema, model } from 'mongoose';

const adSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    price: {
      usd: { type: Number, min: 0 },
      idr: { type: Number, min: 0 },
      rub: { type: Number, min: 0 },
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
    },      
    photos: [
      {
        type: String,
        required: false,
      },
    ],
    viewerIds: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
        }
      ],      
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    location: {
        type: Schema.Types.ObjectId,
        ref: 'Location',
        required: true,
      },
    favoriteUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      }
    ],
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default model('Ad', adSchema);
