//------------------------------------------------------------
// controllers/chatController.js
//------------------------------------------------------------
import fs from "fs";
import path from "path";

import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import UploadedFile from "../models/UploadFile.js";
import User from "../models/User.js";
import { sendPushNotification } from "../utils/sendPushNotification.js";
import agenda from "../agenda/agendaInstance.js";
import { getSystemUserId } from "../utils/getSystemUserId.js";
import { ERROR_MESSAGES } from "../langs/chat.js";

function getErrorMessage(key, lang = "en") {
  return (ERROR_MESSAGES[key] && (ERROR_MESSAGES[key][lang] || ERROR_MESSAGES[key].en)) || key;
}

const enrichChat = (chat, userId) => {
  const companion = chat.participants.find((p) => p._id.toString() !== userId);
  const unreadCount = chat.unreadCounts?.get(userId.toString()) || 0;

  return {
    _id: chat._id,
    updatedAt: chat.updatedAt,
    isSystemChat: chat.isSystemChat,
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
    callback({ success: false, error: getErrorMessage("chat_fetch_error", 'en') });
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
  const lang = 'en';
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
    cb({ success: false, error: getErrorMessage("message_fetch_error", lang) });
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
    const lang = 'en';
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
      if (
        !repliedMessage ||
        String(repliedMessage.chatId) !== String(chat._id)
      ) {
        return callback({
          success: false,
          error: getErrorMessage("invalid_reply_message", lang),
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

    chat.lastMessage = { text: text || "[Изображения]", date: new Date() };
    if (recipientId) {
      chat.unreadCounts.set(
        recipientId.toString(),
        (chat.unreadCounts.get(recipientId.toString()) || 0) + 1
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

    const SYSTEM_USER_ID = getSystemUserId();

    if (isNewChat &&
      senderId.toString() !== SYSTEM_USER_ID &&
      recipientId.toString() !== SYSTEM_USER_ID) {
      const fullChat = await Chat.findById(chat._id)
        .populate({ path: "ad", select: "title photos" })
        .populate({ path: "participants", select: "name email" });

      const senderChatDto = enrichChat(fullChat, senderId);
      const companionChatDto = enrichChat(fullChat, recipientId);

      io.in(`user:${recipientId}`).socketsJoin(chat._id.toString());
      io.in(`user:${senderId}`).socketsJoin(chat._id.toString());

      io.to(`user:${senderId}`).emit("new_chat", senderChatDto);
      io.to(`user:${recipientId}`).emit("new_chat", companionChatDto);

      await agenda.schedule("in 1 minute", "send review reminder to buyer", {
        buyerId: senderId,
        sellerId: recipientId,
        adId,
        lang
      });
    }

    const recipient = await User.findById(recipientId);
    const companionName = recipient?.name || "Пользователь";

    if (recipient?.expoPushToken) {
      const fullChat = await Chat.findById(chat._id).populate("ad", "title photos");
      const adPhoto = fullChat.ad.photos?.[0]?.uri ?? "";
      const adName  = fullChat.ad.title;

      await sendPushNotification(
        recipient.expoPushToken,
        `${message.sender.name}: ${text}`,
        "Новое сообщение",
        {
          chatId: chat._id,
          adId,
          companionId: recipientId,
          companionName: companionName,
          adPhoto,
          adName,
        }
      );
    }

    callback({ success: true, newMessage, chatId: chat._id, isNewChat });
  } catch (err) {
    console.error("Ошибка при отправке сообщения:", err);
    callback({ success: false, error: getErrorMessage("internal_server_error", lang) });
  }
};

export const readChat = async (socket, io, { chatId }) => {
  try {
    const userId = socket.userId;
    const chat = await Chat.findById(chatId);
    if (!chat) return;

    chat.unreadCounts.set(userId, 0);
    await chat.save();

    socket.join(chat._id.toString());

    const lastMsg = await Message.findOne({
      chatId,
      sender: { $ne: userId },
      isRead: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .populate("sender");

    if (lastMsg) {
      lastMsg.isRead = true;
      await lastMsg.save();

      const senderId =
        lastMsg.sender._id?.toString?.() || lastMsg.sender.toString();

      io.to(`user:${senderId}`).emit("message_read", {
        chatId,
        messageId: lastMsg._id,
      });
    }
  } catch (err) {
    console.error("Ошибка в readChat:", err);
  }
};

export const setReaction = async (socket, io, { messageId, reaction }, cb) => {
    const lang = 'en';
  try {
    const userId = socket.userId;
    const message = await Message.findById(messageId).populate("sender");
    if (!message) return cb({ success: false, error: getErrorMessage("message_not_found", lang) });

    const senderId =
      message.sender._id?.toString?.() || message.sender.toString();
    if (senderId === userId.toString()) {
      return cb({
        success: false,
        error: getErrorMessage("cannot_react_self", lang),
      });
    }

    const chat = await Chat.findById(message.chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return cb({ success: false, error: getErrorMessage("no_chat_access", lang) });
    }

    message.reaction = reaction || null;
    await message.save();

    io.to(chat._id.toString()).emit("reaction_updated", {
      messageId,
      chatId: chat._id,
      reaction: message.reaction,
    });

    cb({ success: true });
  } catch (err) {
    console.error("Ошибка при установке реакции:", err);
    cb({ success: false, error: getErrorMessage("reaction_set_error", lang) });
  }
};

export const uploadChatPhotos = async (req, res) => {
  const lang = 'en';
  try {
    const userId = req.userId;
    if (!req.uploadedFiles || !req.uploadedFiles.length) {
      return res.status(400).json({ message: getErrorMessage("file_not_uploaded", lang) });
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
    res.status(500).json({ message: getErrorMessage("upload_error", lang) });
  }
};

export const deleteUploadedPhoto = async (req, res) => {
    const lang = 'en';
  try {
    const { id } = req.params;
    const file = await UploadedFile.findById(id);
    if (!file) return res.status(404).json({ message: getErrorMessage("file_not_found", lang) });
    if (file.author.toString() !== req.userId)
      return res.status(403).json({ message: getErrorMessage("no_access", lang) });

    const filepath = path.join("uploads", file.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    await file.deleteOne();
    res.json({ message: getErrorMessage("file_deleted", lang) });
  } catch (err) {
    console.error("Ошибка при удалении фото:", err);
    res.status(500).json({ message: getErrorMessage("internal_server_error", lang) });
  }
};

export const deleteMessage = async (socket, io, { messageId }, cb) => {
    const lang = 'en';
  try {
    const userId = socket.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return cb({ success: false, error: getErrorMessage("message_not_found", lang) });
    }

    if (message.sender._id.toString() !== userId.toString()) {
      return cb({
        success: false,
        error: getErrorMessage("cannot_delete_message", lang),
      });
    }

    const chatId = message.chatId;

    await message.deleteOne();

    io.to(chatId.toString()).emit("message_deleted", {
      messageId,
      chatId,
    });

    cb({ success: true });
  } catch (err) {
    console.error("Ошибка при удалении сообщения:", err);
    cb({ success: false, error: getErrorMessage("message_delete_error", lang) });
  }
};

export const editMessage = async (
  socket,
  io,
  { messageId, text, mediaUrl },
  cb
) => {
    const lang = 'en';
  try {
    const userId = socket.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return cb({ success: false, error: getErrorMessage("message_not_found", lang) });
    }

    if (message.sender.toString() !== userId) {
      return cb({
        success: false,
        error: getErrorMessage("cannot_edit_message", lang),
      });
    }

    const oldMediaUrls = message.mediaUrl || [];

    const hasTextChanged = typeof text === "string" && message.text !== text;
    const hasMediaChanged =
      Array.isArray(mediaUrl) &&
      JSON.stringify(mediaUrl) !== JSON.stringify(oldMediaUrls);

    if (!hasTextChanged && !hasMediaChanged) {
      return cb({ success: false, error: getErrorMessage("no_changes", lang) });
    }

    if (hasTextChanged) message.text = text;
    if (hasMediaChanged) message.mediaUrl = mediaUrl;

    message.isChanged = true;
    await message.save();

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

    await message.populate({ path: "sender", select: "name avatar" });

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
    cb({ success: false, error: getErrorMessage("message_edit_error", lang) });
  }
};

export const typeMessage = (socket, io, { chatId, isTyping }) => {
  if (chatId) {
    socket.to(chatId.toString()).emit("typing", {
      chatId,
      userId: socket.userId,
      isTyping,
    });
  }
};
