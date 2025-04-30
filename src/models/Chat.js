import { Schema, model } from 'mongoose';

const chatSchema = new Schema({
    ad: {
      type: Schema.Types.ObjectId,
      ref: 'Ad',
      required: true,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      }
    ],
    lastMessage: {
      text: { type: String },
      date: { type: Date }
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {}
    }
  }, {
    timestamps: true
  });
  
export default model('Chat', chatSchema);