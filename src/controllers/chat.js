//------------------------------------------------------------
// controllers/chatController.js (пример названия файла)
//------------------------------------------------------------
import path from 'path';
import fs   from 'fs';

import Chat         from '../models/Chat.js';
import Message      from '../models/Message.js';
import UploadedFile from '../models/UploadFile.js';

/* ------------------------------------------------------------------ */
/* 1. список чатов пользователя                                        */
/* ------------------------------------------------------------------ */
export const getUserChats = async (socket, _data, callback) => {
  const userId = socket.userId;

  try {
    const chats = await Chat.find({ participants: userId })
      .populate({ path: 'ad',          select: 'title photos' })
      .populate({ path: 'participants', select: 'name email' })
      .sort({ updatedAt: -1 });

    const enriched = chats.map(chat => {
      const companion   = chat.participants.find(p => p._id.toString() !== userId);
      const unreadCount = chat.unreadCounts?.get(userId.toString()) || 0;

      return {
        _id: chat._id,
        updatedAt: chat.updatedAt,
        lastMessage: {
          text : chat.lastMessage?.text  || '',
          date : chat.lastMessage?.date  || null,
          unreadCount,                       // только для текущего юзера
        },
        ad: chat.ad
          ? {
              _id   : chat.ad._id,
              title : chat.ad.title,
              photo : chat.ad.photos?.[0] || null,
            }
          : null,
        companion,
      };
    });

    callback({ success: true, chats: enriched });
  } catch (err) {
    console.error(err);
    callback({ success: false, error: 'Ошибка при получении чатов' });
  }
};

/* ------------------------------------------------------------------ */
/* 2. при соединении пользователя                                      */
/* ------------------------------------------------------------------ */
export const connectUser = async socket => {
  try {
    /* 🔹 личная комната пользователя */
    socket.join(`user:${socket.userId}`);

    /* 🔹 подписываемся на все его чаты */
    const userChats = await Chat.find({ participants: socket.userId }, '_id');

    userChats.forEach(chat => {
      socket.join(chat._id.toString());
    });

    console.log(`✅ user:${socket.userId} → личная + ${userChats.length} чатов`);
  } catch (err) {
    console.error('Ошибка при авто‑присоединении к чатам:', err);
  }
};

/* ------------------------------------------------------------------ */
/* 3. получить сообщения                                               */
/* ------------------------------------------------------------------ */
export const getMessages = async (socket, { chatId, page = 1, limit = 20 }, cb) => {
  try {
    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Message.countDocuments({ chatId });

    cb({
      success : true,
      messages,
      totalMessages: total,
      page,
      totalPages  : Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    cb({ success: false, error: 'Ошибка при получении сообщений' });
  }
};

/* ------------------------------------------------------------------ */
/* 4. отправить сообщение                                              */
/* ------------------------------------------------------------------ */
export const sendMessage = async (
  socket,
  io,
  { chatId, adId, recipientId, text = '', mediaUrl = [], mediaType = '' },
  callback
) => {
  try {
    const senderId = socket.userId;

    /* 1 — ищем / создаём чат */
    let chat = chatId
      ? await Chat.findById(chatId)
      : await Chat.findOne({
          ad: adId,
          participants: { $all: [senderId, recipientId], $size: 2 },
        });

    let isNewChat = false;
    if (!chat) {
      chat = await Chat.create({
        ad: adId,
        participants: [senderId, recipientId],
        unreadCounts: { [senderId]: 0, [recipientId]: 0 },
      });
      isNewChat = true;
    }

    /* 2 — создаём сообщение */
    const message = await Message.create({
      chatId : chat._id,
      sender : senderId,
      text,
      mediaUrl,
      mediaType,
    });

    /* 3 — обновляем мета‑инфо чата */
    const anotherUserId = chat.participants.find(id => id.toString() !== senderId);
    chat.lastMessage = { text: text || '[Изображения]', date: new Date() };

    if (anotherUserId) {
      chat.unreadCounts.set(
        anotherUserId.toString(),
        (chat.unreadCounts.get(anotherUserId.toString()) || 0) + 1
      );
    }
    await chat.save();

    /* 4 — sender всегда в комнате чата */
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

    /* 5 — если чат новый, уведомляем обоих одним событием */
    if (isNewChat) {
      const chatDTO = {
        _id  : chat._id,
        adId : chat.ad,
        participants: chat.participants,
        lastMessage : chat.lastMessage,
        unreadCounts: Object.fromEntries(chat.unreadCounts),
      };

      /* 🔹 5.1 — добавляем ВСЕ соединения получателя в комнату чата */
      io.in(`user:${recipientId}`).socketsJoin(chat._id.toString());

      /* 🔹 5.2 — одно событие на всю комнату */
      io.to(chat._id.toString()).emit('new_chat', chatDTO);
    }

    callback({ success: true, newMessage, chatId: chat._id, isNewChat });
  } catch (err) {
    console.error('Ошибка при отправке сообщения:', err);
    callback({ success: false, error: 'Internal server error' });
  }
};

/* ------------------------------------------------------------------ */
/* 5. отметить чат прочитанным                                         */
/* ------------------------------------------------------------------ */
export const readChat = async (socket, { chatId }) => {
  const chat = await Chat.findById(chatId);
  if (chat) {
    chat.unreadCounts.set(socket.userId, 0);
    await chat.save();
  }
};

/* ------------------------------------------------------------------ */
/* 6. загрузка файлов                                                  */
/* ------------------------------------------------------------------ */
export const uploadChatPhotos = async (req, res) => {
  try {
    const userId = req.userId;

    if (!req.uploadedFiles || !req.uploadedFiles.length) {
      return res.status(400).json({ message: 'Файлы не были загружены' });
    }

    const photoData = req.uploadedFiles.map(f => ({
      id      : f._id,
      uri     : f.uri,
      filename: f.filename,
      author  : userId,
    }));

    res.status(201).json(photoData);
  } catch (err) {
    console.error('Ошибка при загрузке фото:', err);
    res.status(500).json({ message: 'Ошибка при загрузке изображений' });
  }
};

/* ------------------------------------------------------------------ */
/* 7. удаление файла                                                   */
/* ------------------------------------------------------------------ */
export const deleteUploadedPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const file   = await UploadedFile.findById(id);

    if (!file) {
      return res.status(404).json({ message: 'Файл не найден' });
    }
    if (file.author.toString() !== req.userId) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const filepath = path.join('uploads', file.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    await file.deleteOne();
    res.json({ message: 'Файл удалён' });
  } catch (err) {
    console.error('Ошибка при удалении фото:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
