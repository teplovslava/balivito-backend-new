// 📁 agenda/reviewReminder.js
import User from "../models/User.js";
import Ad from "../models/Ad.js";
import Message from "../models/Message.js";
import { getSystemChatForUser } from '../utils/getSystemChat.js';
import { getSystemUserId } from "../utils/getSystemUserId.js";
import Chat from "../models/Chat.js";
import { sendPushNotification } from "../utils/sendPushNotification.js"; // ← обязательно импорт
import { getIo } from "../utils/ioHolder.js";

export default (agenda) => {
  agenda.define("send review reminder to buyer", async (job) => {
    const SYSTEM_NAME='Balivito';
    const SYSTEM_USER_ID = getSystemUserId();
    const { buyerId, sellerId, adId } = job.attrs.data;

    if (!buyerId || !sellerId || !adId) return;
    if (sellerId === SYSTEM_USER_ID || buyerId === SYSTEM_USER_ID) return;

    const buyer = await User.findById(buyerId);
    const seller = await User.findById(sellerId);
    const ad = await Ad.findById(adId).select("title photos");

    if (!buyer || !seller || !ad) return;

    // Проверяем, оставил ли покупатель уже отзыв по этому объявлению
    const alreadyLeftFeedback = seller.feedbacks?.some(
      (fb) =>
        fb.author._id.toString() === buyerId.toString() &&
        fb.ad?.toString() === adId
    );
    if (alreadyLeftFeedback) return;

    const {systemChat, wasCreated} = await getSystemChatForUser(buyerId);

    // Проверка: уже было такое напоминание?
    const alreadySent = await Message.findOne({
      chatId: systemChat._id,
      "action.meta.toUser._id": seller._id,
      "action.meta.ad._id": ad._id,
      "action.type": "leave_feedback",
    });
    if (alreadySent) return;

    const fullChat = await Chat.findById(systemChat._id).populate({ path: 'participants', select: 'name email' });

    // Создаём системное сообщение
    const message = await Message.create({
      chatId: systemChat._id,
      sender: SYSTEM_USER_ID,
      text: "Пожалуйста, оставьте отзыв о продавце",
      mediaUrl: [],
      lastMessage: {
        text: "Пожалуйста, оставьте отзыв о продавце",
        unreadCount: fullChat.unreadCounts?.get(buyerId.toString()) || 0,
        date: new Date()
      },
      action: {
        type: "leave_feedback",
        label: "Оставить отзыв",
        meta: {
          toUser: {
            _id: seller._id,
            name: seller.name,
          },
          ad: {
            _id: ad._id,
            title: ad.title,
            photo: ad.photos?.[0] || null,
          },
        },
      },
    });

    // Готовим и отправляем событие о чате и сообщении через сокеты
    const chatDto = {
      _id: fullChat._id,
      updatedAt: fullChat.updatedAt,
      lastMessage: {
        text: message.text,
        date: message.createdAt,
        unreadCount: fullChat.unreadCounts?.get(buyerId.toString()) || 0,
      },
      ad: null,
      companion: {
        _id: SYSTEM_USER_ID,
        name: SYSTEM_NAME,
      },
      isSystemChat: true
    };

    const io = getIo();

    if (io) {
      io.in(`user:${buyerId}`).socketsJoin(fullChat._id.toString());
      if(wasCreated) {
        io.to(`user:${buyerId}`).emit("new_chat", chatDto);
      }
    }

    // ⏫ PUSH-уведомление (если есть expoPushToken)
    if (buyer?.expoPushToken) {
      await sendPushNotification(
        buyer.expoPushToken,
        "Пожалуйста, оставьте отзыв о продавце",
        "Системное сообщение",
        {
          chatId: fullChat._id,
          adId: ad._id,
          companionId: SYSTEM_USER_ID,
          companionName: SYSTEM_NAME,
          adPhoto:"",
          adName:"",
          isSystemChat: true
        }
      );
    }

    console.log(`✅ Отправлено напоминание покупателю ${buyerId}`);
  });
};
