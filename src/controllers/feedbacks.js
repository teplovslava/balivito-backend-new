// controllers/feedbackController.js
import mongoose from "mongoose";
import User from "../models/User.js";
import Ad from "../models/Ad.js";
import { getSystemChatForUser } from "../utils/getSystemChat.js";
import Message from "../models/Message.js";
import { getSystemUserId } from "../utils/getSystemUserId.js";
import { getIo } from "../utils/ioHolder.js";
import { sendPushNotification } from "../utils/sendPushNotification.js";

export const setFeedback = async (req, res) => {
  const SYSTEM_USER_ID = getSystemUserId();
  const SYSTEM_NAME    = "BALIVITO";

  try {
    const authorId = req.userId;           // покупатель-/продавец, кто пишет отзыв
    const targetId = req.params.id;        // кому адресован отзыв
    const { text, rating, adId } = req.body;

    /* ─────────── базовые проверки ─────────── */
    if (
      !mongoose.Types.ObjectId.isValid(targetId) ||
      !mongoose.Types.ObjectId.isValid(adId)
    ) {
      return res
        .status(400)
        .json({ message: "Некорректный ID пользователя или объявления" });
    }

    if (authorId === targetId)
      return res.status(400).json({ message: "Нельзя оставить отзыв самому себе" });

    /* ─────────── сущности ─────────── */
    const [targetUser, authorUser, ad] = await Promise.all([
      User.findById(targetId),
      User.findById(authorId),
      Ad.findById(adId).select("title photos"),
    ]);

    if (!targetUser || !authorUser || !ad)
      return res.status(404).json({ message: "Пользователь или объявление не найдены" });

    /* ─────────── сохраняем отзыв ─────────── */
    const newFeedback = {
      author: { _id: authorUser._id, name: authorUser.name },
      text,
      rating,
      ad: adId,
      createdAt: new Date(),
    };

    targetUser.feedbacks.push(newFeedback);
    targetUser.rating =
      Number(
        (
          targetUser.feedbacks.reduce((s, f) => s + Number(f.rating), 0) /
          targetUser.feedbacks.length
        ).toFixed(1)
      );
    await targetUser.save();

    /* ─────────── системный пользователь? ─────────── */
    if (targetId === SYSTEM_USER_ID)
      return res.status(201).json({ feedback: newFeedback, rating: targetUser.rating });

    /* ─────────── создаём/ищем системный чат ─────────── */
    const { systemChat, wasCreated } = await getSystemChatForUser(targetId);

    /* уже было “предложение оставить отзыв” от этой пары по этому объявлению? */
    const duplication = await Message.exists({
      chatId: systemChat._id,
      "action.meta.toUser._id": authorUser._id,
      "action.meta.ad._id": ad._id,
      "action.type": "leave_feedback",
    });
    if (!duplication) {
      await Message.create({
        chatId: systemChat._id,
        sender: SYSTEM_USER_ID,
        text: `${authorUser.name} оставил вам отзыв`,
        mediaUrl: [],
        action: {
          type: "leave_feedback",
          label: "Оставить ответный отзыв",
          meta: {
            toUser: { _id: authorUser._id, name: authorUser.name },
            ad:     { _id: ad._id, title: ad.title, photo: ad.photos?.[0] ?? null },
          },
        },
      });
    }

    /* ─────────── обновляем lastMessage / unreadCounts ─────────── */
    systemChat.lastMessage = { text: `${authorUser.name} оставил вам отзыв`, date: new Date() };
    systemChat.unreadCounts.set(
      targetId.toString(),
      (systemChat.unreadCounts.get(targetId.toString()) || 0) + 1
    );
    await systemChat.save();

    /* ─────────── сокеты / push ─────────── */
    const io = getIo();
    if (io) {
      const chatDto = {
        _id: systemChat._id,
        updatedAt: systemChat.updatedAt,
        lastMessage: {
          text: systemChat.lastMessage.text,
          date: systemChat.lastMessage.date,
          unreadCount: systemChat.unreadCounts.get(targetId.toString()) || 0,
        },
        ad: null,
        companion: { _id: SYSTEM_USER_ID, name: SYSTEM_NAME },
        isSystemChat: true,
      };

      io.in(`user:${targetId}`).socketsJoin(systemChat._id.toString());
      if (wasCreated) {
        io.to(`user:${targetId}`).emit("new_chat", chatDto);
      } else {
        io.to(systemChat._id.toString()).emit("new_message", {
          chatId: systemChat._id,
          sender: { _id: SYSTEM_USER_ID, name: SYSTEM_NAME },
          text: systemChat.lastMessage.text,
          mediaUrl: [],
          createdAt: systemChat.lastMessage.date,
          isRead: false,
          isChanged: false,
        });
      }
    }

    if (targetUser.expoPushToken) {
      await sendPushNotification(
        targetUser.expoPushToken,
        `${authorUser.name} оставил вам отзыв`,
        "Системное сообщение",
        {
          chatId: systemChat._id,
          companionId: SYSTEM_USER_ID,
          companionName: SYSTEM_NAME,
          isSystemChat: true,
        }
      );
    }

    return res.status(201).json({ feedback: newFeedback, rating: targetUser.rating });
  } catch (err) {
    console.error("Ошибка добавления отзыва:", err);
    return res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getFeedback = async (req, res) => {
  try {
    const userId = req.params.id;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Некорректный ID пользователя" });
    }

    const user = await User.findById(userId).select("feedbacks rating");

    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const allFeedbacks = user.feedbacks.slice().reverse();
    const paginated = allFeedbacks.slice((page - 1) * limit, page * limit);

    res.json({
      items: paginated,
      rating: user.rating,
      pagination: {
        total: allFeedbacks.length,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(allFeedbacks.length / limit),
      },
    });
  } catch (err) {
    console.error("Ошибка получения отзывов:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const deleteFeedback = async (req, res) => {
  try {
    const userId = req.userId;
    const targetId = req.params.id;
    const feedbackId = req.params.feedbackId;

    const user = await User.findById(targetId);

    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const feedback = user.feedbacks.id(feedbackId);
    if (!feedback) {
      return res.status(404).json({ message: "Отзыв не найден" });
    }

    if (feedback.author._id.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Вы не можете удалить этот отзыв" });
    }

    feedback.remove();

    // Пересчёт рейтинга
    const feedbacks = user.feedbacks;
    const avgRating = feedbacks.length
      ? feedbacks.reduce((acc, curr) => acc + Number(curr.rating), 0) /
        feedbacks.length
      : 0;
    user.rating = Number(avgRating.toFixed(1));

    await user.save();
    res.json({ message: "Отзыв удалён", rating: user.rating });
  } catch (err) {
    console.error("Ошибка удаления отзыва:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
