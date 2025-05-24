import User    from '../models/User.js';
import Ad      from '../models/Ad.js';
import Review  from '../models/Review.js';
import Message from '../models/Message.js';

import { getSystemChatForUser } from '../utils/getSystemChat.js';
import { getSystemUserId      } from '../utils/getSystemUserId.js';
import { sendPushNotification } from '../utils/sendPushNotification.js';
import { getIo                } from '../utils/ioHolder.js';
import { buildChatPayload     } from '../utils/buildChatNotificationPayload.js';

import {
  REMINDER_TEXTS,
  LEAVE_REVIEW_LABEL,
  SYSTEM_MESSAGE_TITLE
} from '../langs/agenda.js'


// Получить язык пользователя или задачи
function getUserLang(jobLang) {
  return jobLang || 'en';
}

export default (agenda) => {
  agenda.define('send review reminder to buyer', async (job) => {
    try {
      const SYSTEM_USER_ID = getSystemUserId();
      const SYSTEM_NAME    = 'BALIVITO';

      const { buyerId, sellerId, adId, lang: jobLang } = job.attrs.data;
      if (!buyerId || !sellerId || !adId) return;
      if ([buyerId, sellerId].includes(SYSTEM_USER_ID)) return;

      // ───── сущности ─────
      const [buyer, seller, ad] = await Promise.all([
        User.findById(buyerId),
        User.findById(sellerId),
        Ad.findById(adId).select('title photos'),
      ]);
      if (!buyer || !seller || !ad) return;

      // --- определяем язык ---
      const lang = getUserLang(jobLang);

      // --- тексты и label ---
      const reminderText = REMINDER_TEXTS[lang]?.(seller.name, ad.title)
        || REMINDER_TEXTS['en'](seller.name, ad.title);
      const labelText = LEAVE_REVIEW_LABEL[lang] || LEAVE_REVIEW_LABEL['en'];
      const systemMessageTitle = SYSTEM_MESSAGE_TITLE[lang] || SYSTEM_MESSAGE_TITLE['en'];

      // покупатель уже оставил root-отзыв этому продавцу?
      const alreadyLeft = await Review.exists({
        author: buyerId,
        target: sellerId,
        ad    : adId,
        parent: null,
      });
      if (alreadyLeft) return;

      // ───── систем-чат покупателя ─────
      const { systemChat, wasCreated } = await getSystemChatForUser(buyerId);

      // такое напоминание уже было?
      const duplication = await Message.exists({
        chatId: systemChat._id,
        'action.type'          : 'invite_leave_root',
        'action.meta.toUser._id': seller._id,
        'action.meta.ad._id'   : ad._id,
      });
      if (duplication) return;

      // ───── создаём message-invite ─────
      const message = await Message.create({
        chatId : systemChat._id,
        sender : SYSTEM_USER_ID,
        text   : reminderText,
        mediaUrl: [],
        action : {
          type : 'invite_leave_root',
          label: labelText,
          meta : {
            isSeller: true,
            toUser: { _id: seller._id, name: seller.name },
            ad:     { _id: ad._id, title: ad.title, photo: ad.photos?.[0] ?? null },
          },
        },
      });

      // lastMessage / unreadCounts
      systemChat.lastMessage = { text: message.text, date: message.createdAt };
      systemChat.unreadCounts.set(
        buyerId.toString(),
        (systemChat.unreadCounts.get(buyerId.toString()) || 0) + 1,
      );
      await systemChat.save();

      // ───── сокеты ─────
      const chatDto = {
        _id: systemChat._id,
        updatedAt: systemChat.updatedAt,
        lastMessage: {
          text : message.text,
          date : message.createdAt,
          unreadCount: systemChat.unreadCounts.get(buyerId.toString()) || 0,
        },
        ad: null,
        companion: { _id: SYSTEM_USER_ID, name: SYSTEM_NAME },
        isSystemChat: true,
      };

      const fullMessage = await Message.findById(message._id)
        .populate('sender', 'name')
        .lean();

      const io = getIo();
      if (io) {
        io.in(`user:${buyerId}`).socketsJoin(systemChat._id.toString());
        if (wasCreated) {
          io.to(`user:${buyerId}`).emit('new_chat', chatDto);
        } else {
          io.to(systemChat._id.toString()).emit('new_message', fullMessage);
        }
      }

      // ───── push-уведомление ─────
      if (buyer.expoPushToken) {
        await sendPushNotification(
          buyer.expoPushToken,
          reminderText,
          systemMessageTitle,
          buildChatPayload({
            chatId       : systemChat._id,
            ad,
            companionId  : SYSTEM_USER_ID,
            companionName: SYSTEM_NAME,
            isSystemChat : true,
          }),
        );
      }

      console.log(`✅ Review reminder sent to buyer ${buyerId} [${lang}]`);
    } catch (err) {
      console.warn('⚠️ reviewReminder:', err.message);
    }
  });
};
