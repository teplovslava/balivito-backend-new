import Review  from '../models/Review.js';
import User    from '../models/User.js';
import Ad      from '../models/Ad.js';

import { getSystemChatForUser }  from '../utils/getSystemChat.js';
import { sendSystemInvite      } from '../utils/sendSystemInvite.js';
import { updateInviteAsDone    } from '../utils/updateInviteAsDone.js';

/* ══════════════════════════════════════════════════════════════ */
/* 1.  ДОБАВИТЬ КОРНЕВОЙ ОТЗЫВ  –  POST /reviews/:targetId        */
/* ══════════════════════════════════════════════════════════════ */
export const addReview = async (req, res) => {
  try {
    const authorId = req.userId;
    const targetId = req.params.targetId;
    const { text, rating, adId } = req.body;

    if (!authorId || authorId === targetId)
      return res.status(400).json({ message: 'Некорректные параметры' });

    /* — проверяем дубликат — */
    const duplicate = await Review.exists({
      author: authorId, target: targetId, ad: adId, parent: null,
    });
    if (duplicate)
      return res.status(409).json({ message: 'Вы уже оставляли отзыв по этому объявлению' });

    /* — сущности — */
    const [author, target, ad] = await Promise.all([
      User.findById(authorId),
      User.findById(targetId),
      Ad.findById(adId).select('title photos'),
    ]);
    if (!author || !target || !ad)
      return res.status(404).json({ message: 'Данные не найдены' });

    /* — создаём отзыв — */
    const review = await Review.create({
      author: authorId, target: targetId, ad: adId,
      text, rating, parent: null,
    });

    /* — рейтинг + счётчик — */
    const [agg] = await Review.aggregate([
      { $match: { target: target._id, parent: null } },
      { $group: { _id: null, avg: { $avg: '$rating' }, cnt: { $sum: 1 } } },
    ]);
    target.rating       = +(agg?.avg?.toFixed(1) || 0);
    target.reviewsCount = agg?.cnt || 1;
    await target.save();

    /* — гасим “приглашение оставить отзыв”, если было — */
    const { systemChat: authorChat } = await getSystemChatForUser(authorId);
    await updateInviteAsDone({
      chat  : authorChat,
      filter: { 'action.type': 'invite_leave_root', 'action.meta.ad._id': ad._id },
      newText: `Вы оставили отзыв продавцу ${target.name}: «${text}» — ${rating}★`,
    });

    /* — отправляем приглашение target-у, если он ещё не ответил — */
    const reciprocal = await Review.exists({
      author: targetId, target: authorId, ad: adId, parent: null,
    });
    if (!reciprocal) {
      await sendSystemInvite({
        targetId: targetId,
        text    : `${author.name} оставил вам отзыв`,
        action  : {
          type : 'invite_leave_root',
          label: 'Ответить',
          meta : {         
            toUser: {                     // ← то, что ждёт фронт
              _id : author._id,
              name: author.name,
            },
            ad: {                         // ← и информация об объявлении
              _id  : ad._id,
              title: ad.title,
              photo: ad.photos?.[0] ?? null,
            }, 
          },
        },
      });
    }

    return res.status(201).json(review);
  } catch (e) {
    console.error('addReview', e);
    return res.status(500).json({ message: 'Server error' });
  }
};


/* ══════════════════════════════════════════════════════════════ */
/* 2.  ОТВЕТ НА ОТЗЫВ  –  POST /reviews/:parentId/reply           */
/* ══════════════════════════════════════════════════════════════ */
// controllers/reviewController.js
/* controllers/reviewController.js */

export const replyReview = async (req, res) => {
  try {
    const authorId = req.userId;
    const parentId = req.params.parentId;
    const { text } = req.body;

    const parent = await Review.findById(parentId).populate('ad target');
    if (!parent) return res.status(404).json({ message: 'Отзыв не найден' });

    /* ─── право ответа ─── */
    if (
      authorId !== parent.author.toString() &&
      authorId !== parent.target._id.toString()
    ) {
      return res.status(403).json({ message: 'Нет прав' });
    }

    /* ─── корень треда + владелец ленты ─── */
    const root = parent.parent
      ? await Review.findById(parent.parent).select('target')
      : parent;                                       // parent сам корень

    /* target может быть ObjectId или популяцией User -------------------- */
    let profileOwnerId;
    if (typeof root.target === 'object' && root.target !== null && '_id' in root.target) {
      profileOwnerId = root.target._id.toString();    // популяция
    } else {
      profileOwnerId = root.target.toString();        // ObjectId
    }

    /* ─── создаём ответ ─── */
    const answer = await Review.create({
      author: authorId,
      target: parent.author.toString() === authorId ? parent.target : parent.author,
      ad    : parent.ad,
      text,
      rating: null,
      parent: root._id,                               // всегда корневой
    });

    await answer.populate([
      { path: 'author', select: 'name avatar' },
      { path: 'target', select: 'name' },
    ]);

    /* ─── закрываем своё приглашение ─── */
    const { systemChat: authorChat } = await getSystemChatForUser(authorId);
    await updateInviteAsDone({
      chat  : authorChat,
      filter: { 'action.type': 'invite_reply_reply', 'action.meta.parentId': root._id },
      newText: `Вы ответили пользователю ${answer.target.name}: «${text}»`,
    });

    /* ─── новое приглашение адресату ─── */
    await sendSystemInvite({
      targetId: answer.target._id,                 // теперь очередь собеседника
      text    : `${answer.author.name} ответил(а) на ваш отзыв`,
      action  : {
        type : 'invite_reply_reply',
        label: 'Ответить',
        meta : {
          parentId : root._id.toString(),          // корень треда
          authorId : profileOwnerId,               // ← всегда ID продавца
        },
      },
    });

    return res.status(201).json(answer);
  } catch (e) {
    console.error('replyReview', e);
    return res.status(500).json({ message: 'Server error' });
  }
};



/* ---------------------------------------------------------- *
 * 3. Список отзывов пользователя                             *
 * ---------------------------------------------------------- */
// controllers/reviewController.js

export const listReviews = async (req, res) => {
  try {
    const { targetId } = req.params;
    const page  = +req.query.page  || 1;
    const limit = +req.query.limit || 10;

    /* ─── 1. находим пользователя, чтобы взять name ─── */
    const targetUser = await User.findById(targetId).select('name');
    if (!targetUser)
      return res.status(404).json({ message: 'Пользователь не найден' });

    /* ─── 2. отзывы + ответы ─── */
    const [items, total] = await Promise.all([
      Review.find({ target: targetId, parent: null })
            .sort({ createdAt: -1 })
            .skip((page-1)*limit)
            .limit(limit)
            .populate('author', 'name')
            .lean()
            .then(async roots => {
              const ids = roots.map(r => r._id);
              const replies = await Review.find({ parent: { $in: ids } })
                                          .sort({ createdAt: 1 })
                                          .populate('author', 'name')
                                          .lean();
              const byParent = replies.reduce((acc, r) => {
                (acc[r.parent] ||= []).push(r);
                return acc;
              }, {});
              return roots.map(r => ({ ...r, replies: byParent[r._id] || [] }));
            }),
      Review.countDocuments({ target: targetId, parent: null }),
    ]);

    /* ─── 3. формируем ответ ─── */
    res.json({
      user: { _id: targetUser._id, name: targetUser.name },   // ← имя адресата
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


/* ---------------------------------------------------------- *
 * 4. Удаление отзыва / ответа                                *
 * ---------------------------------------------------------- */
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: 'Не найдено' });
    if (review.author.toString() !== req.userId)
      return res.status(403).json({ message: 'Нет прав' });

    const isRoot = !review.parent;          // корневой?

    const targetId = review.target;         // пользователь, чей рейтинг считаем позже
    await review.deleteOne();

    /* если удалили корневой - пересчитываем рейтинг и количество */
    if (isRoot) {
      const [agg] = await Review.aggregate([
        { $match: { target: targetId, parent: null } },
        {
          $group: {
            _id : null,
            avg : { $avg: '$rating' },
            cnt : { $sum: 1 },
          },
        },
      ]);

      await User.findByIdAndUpdate(targetId, {
        rating      : +(agg?.avg?.toFixed(1) || 0),
        reviewsCount: agg?.cnt || 0,
      });
    }

    return res.json({ message: 'Удалено' });
  } catch (e) {
    console.error('deleteReview', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ---------------------------------------------------------- *
 * 5. Рейтинг + количество отзывов (корневых)                  *
 *    GET /reviews/summary/:userId                            *
 * ---------------------------------------------------------- */
export const userReviewsSummary = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('rating reviewsCount');
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    res.json({ rating: user.rating, reviewsCount: user.reviewsCount });
  } catch (e) {
    console.error('userReviewsSummary', e);
    res.status(500).json({ message: 'Server error' });
  }
};