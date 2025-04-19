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
      required: true,
      minlength: 10,
      maxlength: 2000,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
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
      },
  },
  { timestamps: true }
);

export default model('Ad', adSchema);
