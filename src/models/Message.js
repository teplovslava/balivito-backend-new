import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    default: ''
  },
  mediaUrl: {
    type: String, // ссылка на изображение
    default: ''
  },
  mediaType: {
    type: String, // например, 'image', 'video' (пока можно ограничиться 'image')
    default: ''
  }
}, {
  timestamps: true
});

export default mongoose.model('Message', messageSchema);
