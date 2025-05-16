// 📁 agenda/reviewReminder.js
import User from "../models/User.js";
import Ad from "../models/Ad.js";
import Message from "../models/Message.js";
import { getSystemChatForUser } from '../utils/getSystemChat.js'
import { getSystemUserId } from "../utils/getSystemUserId.js";

export default (agenda) => {
  agenda.define("send review reminder to buyer", async (job) => {
    const SYSTEM_USER_ID = getSystemUserId();
    const { buyerId, sellerId, adId } = job.attrs.data;

    if (!buyerId || !sellerId || !adId) return;
    if (sellerId === SYSTEM_USER_ID || buyerId === SYSTEM_USER_ID) return;

    const buyer = await User.findById(buyerId);
    const seller = await User.findById(sellerId);
    const ad = await Ad.findById(adId).select("title photos");

    if (!buyer || !seller || !ad) return;

    // проверка: оставил ли покупатель уже отзыв продавцу по этому объявлению
    const alreadyLeftFeedback = seller.feedbacks?.some(
      (fb) =>
        fb.author._id.toString() === buyerId.toString() &&
        fb.ad?.toString() === adId
    );

    if (alreadyLeftFeedback) return;

    const systemChat = await getSystemChatForUser(buyerId);

    const alreadySent = await Message.findOne({
      chatId: systemChat._id,
      "action.meta.toUser._id": seller._id,
      "action.meta.ad._id": ad._id,
      "action.type": "leave_feedback",
    });

    if (alreadySent) return;

    await Message.create({
      chatId: systemChat._id,
      sender: SYSTEM_USER_ID,
      text: "Пожалуйста, оставьте отзыв о продавце",
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

    console.log(`✅ Отправлено напоминание покупателю ${buyerId}`);
  });
};