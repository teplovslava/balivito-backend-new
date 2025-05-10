//------------------------------------------------------------
// controllers/chatController.js
//------------------------------------------------------------
import fs from "fs";
import path from "path";

import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import UploadedFile from "../models/UploadFile.js";

// Вынесенная функция для обогащения чата в единый формат
const enrichChat = (chat, userId) => {
  const companion = chat.participants.find((p) => p._id.toString() !== userId);
  const unreadCount = chat.unreadCounts?.get(userId.toString()) || 0;

  return {
    _id: chat._id,
    updatedAt: chat.updatedAt,
    lastMessage: {
      text: chat.lastMessage?.text || "",
      date: chat.lastMessage?.date || null,
      unreadCount,
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
};

/* ------------------------------------------------------------------ */
/* 1. Получение списка чатов пользователя                             */
/* ------------------------------------------------------------------ */
export const getUserChats = async (socket, _data, callback) => {
  const userId = socket.userId;
  try {
    const chats = await Chat.find({ participants: userId })
      .populate({ path: "ad", select: "title photos" })
      .populate({ path: "participants", select: "name email" })
      .sort({ updatedAt: -1 });

    const enriched = chats.map((chat) => enrichChat(chat, userId));

    const totalUnread = enriched.reduce(
      (sum, { lastMessage }) => sum + (lastMessage.unreadCount || 0),
      0
    );
    callback({ success: true, chats: enriched, totalUnread });
  } catch (err) {
    console.error(err);
    callback({ success: false, error: "Ошибка при получении чатов" });
  }
};

/* ------------------------------------------------------------------ */
/* 2. Автоподписка пользователя на его комнаты                        */
/* ------------------------------------------------------------------ */
export const connectUser = async (socket) => {
  try {
    socket.join(`user:${socket.userId}`); // личная комната

    const userChats = await Chat.find({ participants: socket.userId }, "_id");
    userChats.forEach((chat) => socket.join(chat._id.toString()));

    console.log(
      `✅ user:${socket.userId} → личная + ${userChats.length} чатов`
    );
  } catch (err) {
    console.error("Ошибка при авто‑присоединении к чатам:", err);
  }
};

/* ------------------------------------------------------------------ */
/* 3. Получение сообщений по chatId                                  */
/* ------------------------------------------------------------------ */
export const getMessages = async (
  socket,
  { chatId, page = 1, limit = 20 },
  cb
) => {
  try {
    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Message.countDocuments({ chatId });
    cb({
      success: true,
      messages,
      totalMessages: total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    cb({ success: false, error: "Ошибка при получении сообщений" });
  }
};

/* ------------------------------------------------------------------ */
/* 4. Отправка сообщения и обработка нового чата                      */
/* ------------------------------------------------------------------ */
export const sendMessage = async (
  socket,
  io,
  { chatId, adId, recipientId, text = "", mediaUrl = [], mediaType = "" },
  callback
) => {
  try {
    const senderId = socket.userId;

    // 1. Ищем или создаём чат
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

    // 2. Создаём сообщение
    const message = await Message.create({
      chatId: chat._id,
      sender: senderId,
      text,
      mediaUrl,
      mediaType,
    });

    // 3. Обновляем метаданные чата
    const anotherUserId = chat.participants.find(
      (id) => id.toString() !== senderId
    );
    chat.lastMessage = { text: text || "[Изображения]", date: new Date() };
    if (anotherUserId) {
      chat.unreadCounts.set(
        anotherUserId.toString(),
        (chat.unreadCounts.get(anotherUserId.toString()) || 0) + 1
      );
    }
    await chat.save();

    // 4. Оповещение о новом сообщении
    socket.join(chat._id.toString());
    const newMessage = {
      _id: message._id,
      chatId: chat._id,
      sender: message.sender,
      text: message.text,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      createdAt: message.createdAt,
      isRead: message.isRead,
    };
    io.to(chat._id.toString()).emit("new_message", newMessage);

    // 5. Если чат новый — обогащаем и рассылаем одним событием
    if (isNewChat) {
      // повторно получаем chat с populate
      const fullChat = await Chat.findById(chat._id)
        .populate({ path: "ad", select: "title photos" })
        .populate({ path: "participants", select: "name email" });

      const senderChatDto = enrichChat(fullChat, senderId);
      const companionChatDto = enrichChat(fullChat, recipientId);

      // 2) Подсаживаем все соединения получателя (и при желании отправителя) в комнату чата
      //    Чтобы внутри чата потом точно слушать `new_message` и т.п.
      io.in(`user:${recipientId}`).socketsJoin(chat._id.toString());
      io.in(`user:${senderId}`).socketsJoin(chat._id.toString());

      // 3) Шлём каждому своё событие в его «личную» комнату
      io.to(`user:${senderId}`).emit("new_chat", senderChatDto);
      io.to(`user:${recipientId}`).emit("new_chat", companionChatDto);
    }

    callback({ success: true, newMessage, chatId: chat._id, isNewChat });
  } catch (err) {
    console.error("Ошибка при отправке сообщения:", err);
    callback({ success: false, error: "Internal server error" });
  }
};

/* ------------------------------------------------------------------ */
/* 6. Отметить чат прочитанным                                         */
/* ------------------------------------------------------------------ */
export const readChat = async (socket, io, { chatId }) => {
  try {
    const userId = socket.userId;
    const chat = await Chat.findById(chatId);
    if (!chat) return;

    // Сброс счётчика непрочитанных сообщений
    chat.unreadCounts.set(userId, 0);
    await chat.save();

    // Присоединение сокета к комнате (на случай первого захода)
    socket.join(chat._id.toString());

    // Ищем последнее сообщение, которое отправил текущий пользователь
    const lastMsg = await Message.findOne({
      chatId,
      sender: { $ne: userId },
      isRead: { $ne: true }, // только если ещё не было прочитано
    }).sort({ createdAt: -1 });

    if (lastMsg) {
      // Обновляем isRead
      lastMsg.isRead = true;
      await lastMsg.save();

      // Уведомляем отправителя, что сообщение прочитано
      io.to(`user:${userId}`).emit("message_read", {
        chatId,
        messageId: lastMsg._id,
      });
    }
  } catch (err) {
    console.error("Ошибка в readChat:", err);
  }
};

/* ------------------------------------------------------------------ */
/* 7. Загрузка фото                                                   */
/* ------------------------------------------------------------------ */
export const uploadChatPhotos = async (req, res) => {
  try {
    const userId = req.userId;
    if (!req.uploadedFiles || !req.uploadedFiles.length) {
      return res.status(400).json({ message: "Файлы не были загружены" });
    }
    const photoData = req.uploadedFiles.map((f) => ({
      id: f._id,
      uri: f.uri,
      filename: f.filename,
      author: userId,
    }));
    res.status(201).json(photoData);
  } catch (err) {
    console.error("Ошибка при загрузке фото:", err);
    res.status(500).json({ message: "Ошибка при загрузке изображений" });
  }
};

/* ------------------------------------------------------------------ */
/* 8. Удаление файла                                                  */
/* ------------------------------------------------------------------ */
export const deleteUploadedPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await UploadedFile.findById(id);
    if (!file) return res.status(404).json({ message: "Файл не найден" });
    if (file.author.toString() !== req.userId)
      return res.status(403).json({ message: "Нет доступа" });

    const filepath = path.join("uploads", file.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    await file.deleteOne();
    res.json({ message: "Файл удалён" });
  } catch (err) {
    console.error("Ошибка при удалении фото:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
