import Chat from '../models/Chat.js';
import Message from '../models/Message.js';

export const getUserChats = async (socket, data, callback) => {
    const userId = socket.userId;
  
    try {
      const chats = await Chat.find({ participants: userId })
        .populate('ad')
        .populate('participants')
        .sort({ updatedAt: -1 });
  
      callback({ success: true, chats });
    } catch (err) {
      console.error(err);
      callback({ success: false, error: 'Ошибка при получении чатов' });
    }
};

export const connectUser = async (socket) => {
    try {
        const userChats = await Chat.find({ participants: socket.userId }, '_id');

        userChats.forEach(chat => {
            socket.join(chat._id.toString());
        });

        console.log(`✅ Присоединили к ${userChats.length} чатам`);
    } catch (err) {
        console.error('Ошибка при авто-присоединении к чатам:', err);
    }
}

export const getMessages = async (socket, { chatId, page = 1, limit = 20 }, callback) => {
    try {
      const messages = await Message.find({ chatId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
  
      const totalMessages = await Message.countDocuments({ chatId });
  
      callback({
        success: true,
        messages,
        totalMessages,
        page,
        totalPages: Math.ceil(totalMessages / limit),
      });
    } catch (err) {
      console.error(err);
      callback({ success: false, error: 'Ошибка при получении сообщений' });
    }
};

export const sendMessage = async (socket, io, { adId, recipientId, text = '', mediaUrl = '', mediaType = '' }) => {
    try {
      console.log(adId, recipientId, text)
      const senderId = socket.userId;
  
      let chat = await Chat.findOne({
        ad: adId,
        participants: { $all: [senderId, recipientId], $size: 2 }
      });
  
      if (!chat) {
        chat = await Chat.create({
          ad: adId,
          participants: [senderId, recipientId],
          unreadCounts: {
            [senderId]: 0,
            [recipientId]: 0
          }
        });
      }
  
      const message = await Message.create({
        chatId: chat._id,
        sender: senderId,
        text,
        mediaUrl,
        mediaType
      });
  
      const anotherUserId = chat.participants.find(id => id.toString() !== senderId);
  
      chat.lastMessage = {
        text: text || '[Изображение]',
        date: new Date()
      };
  
      if (anotherUserId) {
        chat.unreadCounts.set(anotherUserId.toString(), (chat.unreadCounts.get(anotherUserId.toString()) || 0) + 1);
      }
  
      await chat.save();
  
      socket.join(chat._id.toString());
  
      io.to(chat._id.toString()).emit('new_message', {
        _id: message._id,
        chatId: chat._id,
        sender: message.sender,
        text: message.text,
        mediaUrl: message.mediaUrl,
        mediaType: message.mediaType,
        createdAt: message.createdAt
      });
    } catch (err) {
      console.error('Ошибка при отправке сообщения:', err);
    }
};

export const readChat = async (socket, { chatId }) => {
    const chat = await Chat.findById(chatId);
    if (chat) {
        chat.unreadCounts.set(socket.userId, 0);
        await chat.save();
    }
};
  
  