import User from "../models/User.js";
import Ad from "../models/Ad.js";
import Message from "../models/Message.js";
import { getSystemChatForUser } from '../utils/getSystemChat.js';
import { getSystemUserId } from "../utils/getSystemUserId.js";
import { sendPushNotification } from "../utils/sendPushNotification.js";
import { getIo } from "../utils/ioHolder.js";

export default (agenda) => {
  agenda.define("send review reminder to buyer", async (job) => {
    try {
      const SYSTEM_NAME = "BALIVITO";
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

      // Получаем или создаём системный чат
      const { systemChat, wasCreated } = await getSystemChatForUser(buyerId);

      // Проверка: уже было такое напоминание?
      const alreadySent = await Message.findOne({
        chatId: systemChat._id,
        "action.meta.toUser._id": seller._id,
        "action.meta.ad._id": ad._id,
        "action.type": "leave_feedback",
      });
      if (alreadySent) return;

      // Находим системного пользователя (для имени)
      const systemUser = await User.findById(SYSTEM_USER_ID);

      // Создаём системное сообщение
      const message = await Message.create({
        chatId: systemChat._id,
        sender: SYSTEM_USER_ID,
        text: "Пожалуйста, оставьте отзыв о продавце",
        mediaUrl: [],
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

      // Обновляем lastMessage и unreadCounts для пользователя
      systemChat.lastMessage = {
        text: message.text,
        date: message.createdAt,
      };
      systemChat.unreadCounts.set(
        buyerId.toString(),
        (systemChat.unreadCounts.get(buyerId.toString()) || 0) + 1
      );
      await systemChat.save();

      // Собираем chatDto для клиента
      const chatDto = {
        _id: systemChat._id,
        updatedAt: systemChat.updatedAt,
        lastMessage: {
          text: message.text,
          date: message.createdAt,
          unreadCount: systemChat.unreadCounts?.get(buyerId.toString()) || 0,
        },
        ad: null,
        companion: {
          _id: SYSTEM_USER_ID,
          name: systemUser ? systemUser.name : SYSTEM_NAME,
        },
        isSystemChat: true
      };

      // Отправляем событие в сокет только если чат новый
      const io = getIo();
      if (io && wasCreated) {
        io.in(`user:${buyerId}`).socketsJoin(systemChat._id.toString());
        io.to(`user:${buyerId}`).emit("new_chat", chatDto);
      }

      // ⏫ PUSH-уведомление (если есть expoPushToken)
      if (buyer?.expoPushToken) {
        await sendPushNotification(
          buyer.expoPushToken,
          "Пожалуйста, оставьте отзыв о продавце",
          "Системное сообщение",
          {
            chatId: systemChat._id,
            adId: ad._id,
            companionId: SYSTEM_USER_ID,
            companionName: systemUser ? systemUser.name : SYSTEM_NAME,
            adPhoto: "",
            adName: "",
            isSystemChat: true
          }
        );
      }

      console.log(`✅ Отправлено напоминание покупателю ${buyerId}`);
    } catch (e) {
      console.log(e);
    }
  });
};
