// controllers/reviewController.js
import Review  from '../models/Review.js';
import User    from '../models/User.js';
import Ad      from '../models/Ad.js';
import Message from '../models/Message.js';

import { getSystemChatForUser }   from '../utils/getSystemChat.js';
import { getSystemUserId }        from '../utils/getSystemUserId.js';
import { getIo }                  from '../utils/ioHolder.js';
import { sendPushNotification }   from '../utils/sendPushNotification.js';
import { buildChatPayload } from '../utils/buildChatNotificationPayload.js';

/* ───────────────────────────────────────────────────── */
/* 1. Добавить «корневой» отзыв                          */
/* ───────────────────────────────────────────────────── */
export const addReview = async (req, res) => {
  const SYSTEM_USER_ID = getSystemUserId();
  const SYSTEM_NAME    = 'BALIVITO';

  try {
    const authorId = req.userId;
    const targetId = req.params.targetId;
    const { text, rating, adId } = req.body;

    if (!authorId || authorId === targetId)
      return res.status(400).json({ message: 'Некорректные параметры' });

    const [author, target, ad] = await Promise.all([
      User.findById(authorId),
      User.findById(targetId),
      Ad.findById(adId).select('title photos'),
    ]);
    if (!author || !target || !ad)
      return res.status(404).json({ message: 'Данные не найдены' });

    const review = await Review.create({
      author: authorId,
      target: targetId,
      ad    : adId,
      text,
      rating,
      parent: null,
    });

    /* рейтинг адресата */
    const agg = await Review.aggregate([
      { $match: { target: target._id, parent: null } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ]);
    target.rating = +(agg[0]?.avg?.toFixed(1) || 0);
    await target.save();

    await notifyTarget({
      target,
      author,
      ad,
      SYSTEM_USER_ID,
      SYSTEM_NAME,
      text: `${author.name} оставил вам отзыв`,
    });

    res.status(201).json(review);
  } catch (e) {
    console.error('addReview', e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ───────────────────────────────────────────────────── */
/* 2. Ответ на отзыв                                     */
/* ───────────────────────────────────────────────────── */
export const replyReview = async (req, res) => {
  const SYSTEM_USER_ID = getSystemUserId();
  const SYSTEM_NAME    = 'BALIVITO';

  try {
    const authorId = req.userId;
    const parentId = req.params.parentId;
    const { text } = req.body;

    const parent = await Review.findById(parentId).populate('ad target');
    if (!parent)
      return res.status(404).json({ message: 'Отзыв не найден' });

    if (
      authorId !== parent.author.toString() &&
      authorId !== parent.target._id.toString()
    )
      return res.status(403).json({ message: 'Нет прав' });

    const answer = await Review.create({
      author: authorId,
      target:
        parent.author.toString() === authorId ? parent.target : parent.author,
      ad: parent.ad,
      text,
      rating: null,
      parent: parentId,
    });

    const [author, target] = await Promise.all([
      User.findById(authorId),
      User.findById(answer.target),
    ]);

    await notifyTarget({
      target,
      author,
      ad: parent.ad,
      SYSTEM_USER_ID,
      SYSTEM_NAME,
      text: `${author.name} ответил(а) на ваш отзыв`,
    });

    res.status(201).json(answer);
  } catch (e) {
    console.error('replyReview', e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ───────────────────────────────────────────────────── */
/* 3. Список отзывов                                     */
/* ───────────────────────────────────────────────────── */
export const listReviews = async (req, res) => {
  try {
    const { targetId } = req.params;
    const page  = +req.query.page  || 1;
    const limit = +req.query.limit || 10;

    const [items, total] = await Promise.all([
      Review.find({ target: targetId, parent: null })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name')
        .lean()
        .then(async (reviews) => {
          const ids = reviews.map((r) => r._id);
          const replies = await Review.find({ parent: { $in: ids } })
            .sort({ createdAt: 1 })
            .populate('author', 'name')
            .lean();
          const grouped = replies.reduce((acc, r) => {
            (acc[r.parent] ||= []).push(r);
            return acc;
          }, {});
          return reviews.map((r) => ({ ...r, replies: grouped[r._id] || [] }));
        }),
      Review.countDocuments({ target: targetId, parent: null }),
    ]);

    res.json({
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error('listReviews', e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ───────────────────────────────────────────────────── */
/* 4. Удаление отзыва/ответа                             */
/* ───────────────────────────────────────────────────── */
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: 'Не найдено' });
    if (review.author.toString() !== req.userId)
      return res.status(403).json({ message: 'Нет прав' });

    await review.deleteOne();
    res.json({ message: 'Удалено' });
  } catch (e) {
    console.error('deleteReview', e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ───────────────────────────────────────────────────── */
/* helper: уведомление второй стороны                    */
/* ───────────────────────────────────────────────────── */
async function notifyTarget({
  target,
  author,
  ad,
  SYSTEM_USER_ID,
  SYSTEM_NAME,
  text,
}) {
  const { systemChat, wasCreated } = await getSystemChatForUser(target._id);

  await Message.create({
    chatId: systemChat._id,
    sender: SYSTEM_USER_ID,
    text,
    mediaUrl: [],
    action: {
      type: 'leave_feedback',
      label: 'Ответить',
      meta: {
        toUser: { _id: author._id, name: author.name },
        ad,
      },
    },
  });

  systemChat.lastMessage = { text, date: new Date() };
  systemChat.unreadCounts.set(
    target._id.toString(),
    (systemChat.unreadCounts.get(target._id.toString()) || 0) + 1,
  );
  await systemChat.save();

  const io = getIo();
  if (io) {
    const chatDto = {
      _id: systemChat._id,
      updatedAt: systemChat.updatedAt,
      lastMessage: {
        text,
        date: systemChat.lastMessage.date,
        unreadCount: systemChat.unreadCounts.get(target._id.toString()) || 0,
      },
      ad: null,
      companion: { _id: SYSTEM_USER_ID, name: SYSTEM_NAME },
      isSystemChat: true,
    };

    io.in(`user:${target._id}`).socketsJoin(systemChat._id.toString());
    if (wasCreated) {
      io.to(`user:${target._id}`).emit('new_chat', chatDto);
    } else {
      io.to(systemChat._id.toString()).emit('new_message', {
        chatId: systemChat._id,
        sender: { _id: SYSTEM_USER_ID, name: SYSTEM_NAME },
        text,
        mediaUrl: [],
        createdAt: systemChat.lastMessage.date,
        isRead: false,
        isChanged: false,
      });
    }
  }

  if (target.expoPushToken) {
    await sendPushNotification(
      target.expoPushToken,
      text,
      'Системное сообщение',
      buildChatPayload({
        chatId: systemChat._id,
        ad,
        companionId: SYSTEM_USER_ID,
        companionName: SYSTEM_NAME,
        isSystemChat: true,
      }),
    );
  }
}
