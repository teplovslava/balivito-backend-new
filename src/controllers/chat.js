import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import UploadedFile from '../models/UploadFile.js';
import path from 'path';
import fs from 'fs';

export const getUserChats = async (socket, data, callback) => {
  const userId = socket.userId;

  try {
    const chats = await Chat.find({ participants: userId })
      .populate({
        path: 'ad',
        select: 'title photos',
      })
      .populate({
        path: 'participants',
        select: 'name email',
      })
      .sort({ updatedAt: -1 });

    const enrichedChats = chats.map(chat => {
      const companion = chat.participants.find(p => p._id.toString() !== userId);
      const unreadCount = chat.unreadCounts?.get(userId.toString()) || 0;

      return {
        _id: chat._id,
        updatedAt: chat.updatedAt,
        lastMessage: {
          text: chat.lastMessage?.text || '',
          date: chat.lastMessage?.date || null,
          unreadCount, // ✅ только для текущего пользователя
        },
        ad: chat.ad
          ? {
              _id: chat.ad._id,
              title: chat.ad.title,
              photo: chat.ad.photos?.[0] || null,
            }
          : null,
        companion,
      };
    });

    callback({ success: true, chats: enrichedChats });
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

export const sendMessage = async (
  socket,
  io,
  { chatId, adId, recipientId, text = '', mediaUrl = [], mediaType = '' },
  callback
) => {
  try {
    const senderId = socket.userId;

    /* 1. ищем существующий чат */
    let chat = chatId
      ? await Chat.findById(chatId)
      : await Chat.findOne({
          ad: adId,
          participants: { $all: [senderId, recipientId], $size: 2 },
        });

    /* 2. при необходимости создаём новый */
    let isNewChat = false;
    if (!chat) {
      chat = await Chat.create({
        ad: adId,
        participants: [senderId, recipientId],
        unreadCounts: { [senderId]: 0, [recipientId]: 0 },
      });
      isNewChat = true;
    }

    console.log(isNewChat)

    /* 3. создаём сообщение */
    const message = await Message.create({
      chatId : chat._id,
      sender : senderId,
      text,
      mediaUrl,
      mediaType,
    });

    /* 4. обновляем мета‑поля чата */
    const anotherUserId = chat.participants.find(
      id => id.toString() !== senderId
    );

    chat.lastMessage = {
      text: text || '[Изображения]',
      date: new Date(),
    };
    if (anotherUserId) {
      chat.unreadCounts.set(
        anotherUserId.toString(),
        (chat.unreadCounts.get(anotherUserId.toString()) || 0) + 1
      );
    }
    await chat.save();

    /* 5. джоиним комнату и пушим сообщение */
    socket.join(chat._id.toString());

    const newMessage = {
      _id      : message._id,
      chatId   : chat._id,
      sender   : message.sender,
      text     : message.text,
      mediaUrl : message.mediaUrl,
      mediaType: message.mediaType,
      createdAt: message.createdAt,
    };
    io.to(chat._id.toString()).emit('new_message', newMessage);

    /* 6. если это НОВЫЙ чат — сообщаем участникам */
    if (isNewChat) {
      // минимальный DTO, чтобы фронт смог сразу показать карточку чата
      const chatDTO = {
        _id  : chat._id,
        adId : chat.ad,
        participants: chat.participants,
        lastMessage : chat.lastMessage,
        unreadCounts: Object.fromEntries(chat.unreadCounts),
      };
      
      io.to(chat._id.toString()).emit('new_chat', chatDTO);
    }

    callback({ success: true, newMessage, chatId: chat._id, isNewChat });
  } catch (err) {
    console.error('Ошибка при отправке сообщения:', err);
    callback({ success: false, error: 'Internal server error' });
  }
};


export const readChat = async (socket, { chatId }) => {
    const chat = await Chat.findById(chatId);
    if (chat) {
        chat.unreadCounts.set(socket.userId, 0);
        await chat.save();
    }
};
  
export const uploadChatPhotos = async (req, res) => {
  try {
    const userId = req.userId;

    if (!req.uploadedFiles || req.uploadedFiles.length === 0) {
      return res.status(400).json({ message: 'Файлы не были загружены' });
    }

    // Готовим ответ с данными файлов, принадлежащими пользователю
    const photoData = req.uploadedFiles.map(file => ({
      id: file._id,
      uri: file.uri,
      filename: file.filename,
      author: userId
    }));

    res.status(201).json(photoData);
  } catch (error) {
    console.error('Ошибка при загрузке фото:', error);
    res.status(500).json({ message: 'Ошибка при загрузке изображений' });
  }
};



// Отдельный метод для удаления файла
export const deleteUploadedPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await UploadedFile.findById(id);

    if (!file) {
      return res.status(404).json({ message: 'Файл не найден' });
    }

    // Проверка авторства файла
    if (file.author.toString() !== req.userId) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const filepath = path.join('uploads', file.filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    await file.deleteOne();

    res.json({ message: 'Файл удалён' });
  } catch (err) {
    console.error('Ошибка при удалении фото:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
