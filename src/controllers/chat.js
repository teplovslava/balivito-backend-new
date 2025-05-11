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

export const connectUser = async (socket) => {
  try {
    socket.join(`user:${socket.userId}`);
    const userChats = await Chat.find({ participants: socket.userId }, "_id");
    userChats.forEach((chat) => socket.join(chat._id.toString()));
    console.log(
      `✅ user:${socket.userId} → личная + ${userChats.length} чатов`
    );
  } catch (err) {
    console.error("Ошибка при авто‑присоединении к чатам:", err);
  }
};

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
      .populate({ path: "sender", select: "name avatar" })
      .populate({
        path: "replyTo",
        select: "text mediaUrl sender",
        populate: { path: "sender", select: "name avatar" },
      })
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

export const sendMessage = async (
  socket,
  io,
  {
    chatId,
    adId,
    recipientId,
    text = "",
    mediaUrl = [],
    mediaType = "",
    replyTo = null,
  },
  callback
) => {
  try {
    const senderId = socket.userId;

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

    if (replyTo) {
      const repliedMessage = await Message.findById(replyTo).lean();
      if (!repliedMessage) {
        return callback({
          success: false,
          error: "Сообщение, на которое вы отвечаете, не найдено",
        });
      }
      if (String(repliedMessage.chatId) !== String(chat._id)) {
        return callback({
          success: false,
          error: "Нельзя отвечать на сообщение из другого чата",
        });
      }
    }

    const message = await Message.create({
      chatId: chat._id,
      sender: senderId,
      text,
      mediaUrl,
      mediaType,
      replyTo,
    });

    await message.populate({ path: "sender", select: "name avatar" });
    if (replyTo) {
      await message.populate({
        path: "replyTo",
        select: "text sender mediaUrl",
        populate: { path: "sender", select: "name avatar" },
      });
    }

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
      replyTo: message.replyTo || null,
      isChanged: message.isChanged,
    };

    io.to(chat._id.toString()).emit("new_message", newMessage);

    if (isNewChat) {
      const fullChat = await Chat.findById(chat._id)
        .populate({ path: "ad", select: "title photos" })
        .populate({ path: "participants", select: "name email" });

      const senderChatDto = enrichChat(fullChat, senderId);
      const companionChatDto = enrichChat(fullChat, recipientId);

      io.in(`user:${recipientId}`).socketsJoin(chat._id.toString());
      io.in(`user:${senderId}`).socketsJoin(chat._id.toString());

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
      io.to(`user:${lastMsg.sender.toString()}`).emit("message_read", {
        chatId,
        messageId: lastMsg._id,
      });
    }
  } catch (err) {
    console.error("Ошибка в readChat:", err);
  }
};

export const setReaction = async (socket, io, { messageId, reaction }, cb) => {
  try {
    const userId = socket.userId;

    // 1. Ищем сообщение
    const message = await Message.findById(messageId);
    if (!message) {
      return cb({ success: false, error: "Сообщение не найдено" });
    }

    if (message.sender.toString() === userId.toString()) {
      return cb({
        success: false,
        error: "Нельзя ставить реакцию на своё сообщение",
      });
    }

    // 2. Проверка: входит ли пользователь в чат
    const chat = await Chat.findById(message.chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return cb({ success: false, error: "Нет доступа к чату" });
    }

    // 3. Обновляем реакцию
    message.reaction = reaction || null;
    await message.save();

    // 4. Уведомляем всех участников чата
    io.to(chat._id.toString()).emit("reaction_updated", {
      messageId,
      chatId: chat._id,
      reaction: message.reaction,
    });

    cb({ success: true });
  } catch (err) {
    console.error("Ошибка при установке реакции:", err);
    cb({ success: false, error: "Ошибка при установке реакции" });
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

export const deleteMessage = async (socket, io, { messageId }, cb) => {
  try {
    const userId = socket.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return cb({ success: false, error: "Сообщение не найдено" });
    }

    // Только автор сообщения может удалить
    if (message.sender.toString() !== userId.toString()) {
      return cb({
        success: false,
        error: "Вы не можете удалить это сообщение",
      });
    }

    const chatId = message.chatId;

    await message.deleteOne();

    // Уведомление всех в чате
    io.to(chatId.toString()).emit("message_deleted", {
      messageId,
      chatId,
    });

    cb({ success: true });
  } catch (err) {
    console.error("Ошибка при удалении сообщения:", err);
    cb({ success: false, error: "Ошибка при удалении сообщения" });
  }
};

export const editMessage = async (
  socket,
  io,
  { messageId, text, mediaUrl },
  cb
) => {
  try {
    const userId = socket.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return cb({ success: false, error: "Сообщение не найдено" });
    }

    // Проверка прав
    if (message.sender.toString() !== userId) {
      return cb({
        success: false,
        error: "Вы не можете редактировать это сообщение",
      });
    }

    const oldMediaUrls = message.mediaUrl || [];

    const hasTextChanged = typeof text === "string" && message.text !== text;
    const hasMediaChanged =
      Array.isArray(mediaUrl) &&
      JSON.stringify(mediaUrl) !== JSON.stringify(oldMediaUrls);

    // Ничего не поменялось
    if (!hasTextChanged && !hasMediaChanged) {
      return cb({ success: false, error: "Изменений не обнаружено" });
    }

    // Обновляем
    if (hasTextChanged) message.text = text;
    if (hasMediaChanged) message.mediaUrl = mediaUrl;

    message.isChanged = true;
    await message.save();

    // Удаляем только удалённые изображения
    if (hasMediaChanged) {
      const deletedUris = oldMediaUrls.filter((uri) => !mediaUrl.includes(uri));

      const filesToDelete = await UploadedFile.find({
        uri: { $in: deletedUris },
      });

      for (const file of filesToDelete) {
        const filePath = path.join("uploads", file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await file.deleteOne();
      }
    }

    // Повторный populate
    await message.populate({ path: "sender", select: "name avatar" });

    // Оповещение всех участников чата
    io.to(message.chatId.toString()).emit("message_updated", {
      messageId: message._id,
      chatId: message.chatId,
      text: message.text,
      mediaUrl: message.mediaUrl,
      isChanged: message.isChanged,
    });

    cb({ success: true, message });
  } catch (err) {
    console.error("Ошибка при редактировании сообщения:", err);
    cb({ success: false, error: "Ошибка при редактировании сообщения" });
  }
};
