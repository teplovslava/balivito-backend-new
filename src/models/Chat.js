const chatSchema = new mongoose.Schema({
    ad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ad',
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
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