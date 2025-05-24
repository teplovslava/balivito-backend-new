import Review  from '../models/Review.js';
import User    from '../models/User.js';
import Ad      from '../models/Ad.js';

import { messages } from '../langs/review.js';
import { getSystemChatForUser }  from '../utils/getSystemChat.js';
import { sendSystemInvite      } from '../utils/sendSystemInvite.js';
import { updateInviteAsDone    } from '../utils/updateInviteAsDone.js';

// --- Хелпер для языка и шаблонов ---
function getLang(req) {
  return req.language || 'en';
}
function t(key, lang, vars = {}) {
  let template = messages[key]?.[lang] || messages[key]?.en || '';
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/* 1. ДОБАВИТЬ КОРНЕВОЙ ОТЗЫВ */
export const addReview = async (req, res) => {
  try {
    const lang = getLang(req);
    const authorId = req.userId;
    const targetId = req.params.targetId;
    const { text, rating, adId } = req.body;

    if (!authorId || authorId === targetId)
      return res.status(400).json({ message: t('invalid_params', lang) });

    const duplicate = await Review.exists({
      author: authorId, target: targetId, ad: adId, parent: null,
    });
    if (duplicate)
      return res.status(409).json({ message: t('already_reviewed', lang) });

    const [author, target, ad] = await Promise.all([
      User.findById(authorId),
      User.findById(targetId),
      Ad.findById(adId).select('title photos'),
    ]);
    if (!author || !target || !ad)
      return res.status(404).json({ message: t('not_found', lang) });

    const review = await Review.create({
      author: authorId, target: targetId, ad: adId, text, rating, parent: null,
    });

    // --- рейтинг и счетчик ---
    const [agg] = await Review.aggregate([
      { $match: { target: target._id, parent: null } },
      { $group: { _id: null, avg: { $avg: '$rating' }, cnt: { $sum: 1 } } },
    ]);
    target.rating       = +(agg?.avg?.toFixed(1) || 0);
    target.reviewsCount = agg?.cnt || 1;
    await target.save();

    // --- системный чат ---
    const { systemChat: authorChat } = await getSystemChatForUser(authorId);
    await updateInviteAsDone({
      chat  : authorChat,
      filter: { 'action.type': 'invite_leave_root', 'action.meta.ad._id': ad._id },
      newText: t('review_left_notify', lang, { targetName: target.name, text, rating }),
    });

    const reciprocal = await Review.exists({
      author: targetId, target: authorId, ad: adId, parent: null,
    });
    if (!reciprocal) {
      await sendSystemInvite({
        targetId: targetId,
        text    : t('review_for_you_notify', lang, { authorName: author.name }),
        action  : {
          type : 'invite_leave_root',
          label: 'Ответить',
          meta : {         
            toUser: { _id : author._id, name: author.name },
            ad: { _id  : ad._id, title: ad.title, photo: ad.photos?.[0] ?? null }
          },
        },
      });
    }

    return res.status(201).json(review);
  } catch (e) {
    const lang = getLang(req);
    console.error('addReview', e);
    return res.status(500).json({ message: t('server_error', lang) });
  }
};

/* 2. ОТВЕТ НА ОТЗЫВ */
export const replyReview = async (req, res) => {
  try {
    const lang = getLang(req);
    const authorId = req.userId;
    const parentId = req.params.parentId;
    const { text } = req.body;

    const parent = await Review.findById(parentId).populate('ad target');
    if (!parent)
      return res.status(404).json({ message: t('review_not_found', lang) });

    if (
      authorId !== parent.author.toString() &&
      authorId !== parent.target._id.toString()
    ) {
      return res.status(403).json({ message: t('no_rights', lang) });
    }

    const root = parent.parent
      ? await Review.findById(parent.parent).select('target')
      : parent;

    const profileOwnerId =
      typeof root.target === 'object' && root.target !== null && '_id' in root.target
        ? root.target._id.toString()
        : root.target.toString();

    const answer = await Review.create({
      author: authorId,
      target: parent.author.toString() === authorId ? parent.target : parent.author,
      ad    : parent.ad,
      text,
      rating: null,
      parent: root._id,
    });

    await answer.populate([
      { path: 'author', select: 'name avatar' },
      { path: 'target', select: 'name' },
    ]);

    const { systemChat: authorChat } = await getSystemChatForUser(authorId);
    const closeFilter = {
      'action.type'          : 'invite_reply_reply',
      'action.meta.parentId' : root._id.toString(),
    };

    await updateInviteAsDone({
      chat   : authorChat,
      filter : closeFilter,
      newText: t('reply_left_notify', lang, { targetName: answer.target.name, text }),
    });

    await sendSystemInvite({
      targetId: answer.target._id,
      text    : t('reply_on_review_notify', lang, { authorName: answer.author.name }),
      action  : {
        type : 'invite_reply_reply',
        label: 'Ответить',
        meta : {
          parentId : root._id.toString(),
          authorId : profileOwnerId,
        },
      },
    });

    return res.status(201).json(answer);
  } catch (e) {
    const lang = getLang(req);
    console.error('replyReview', e);
    return res.status(500).json({ message: t('server_error', lang) });
  }
};

/* 3. Список отзывов пользователя */
export const listReviews = async (req, res) => {
  try {
    const lang = getLang(req);
    const { targetId } = req.params;
    const page  = +req.query.page  || 1;
    const limit = +req.query.limit || 10;

    const targetUser = await User.findById(targetId).select('name');
    if (!targetUser)
      return res.status(404).json({ message: t('user_not_found', lang) });

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

    res.json({
      user: { _id: targetUser._id, name: targetUser.name },
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    const lang = getLang(req);
    console.error('listReviews', e);
    res.status(500).json({ message: t('server_error', lang) });
  }
};

/* 4. Удаление отзыва / ответа */
export const deleteReview = async (req, res) => {
  try {
    const lang = getLang(req);
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: t('not_found', lang) });
    if (review.author.toString() !== req.userId)
      return res.status(403).json({ message: t('no_rights', lang) });

    const isRoot = !review.parent;
    const targetId = review.target;
    await review.deleteOne();

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

    return res.json({ message: t('deleted', lang) });
  } catch (e) {
    const lang = getLang(req);
    console.error('deleteReview', e);
    return res.status(500).json({ message: t('server_error', lang) });
  }
};

/* 5. Рейтинг + количество отзывов (корневых) */
export const userReviewsSummary = async (req, res) => {
  try {
    const lang = getLang(req);
    const user = await User.findById(req.params.userId).select('rating reviewsCount');
    if (!user)
      return res.status(404).json({ message: t('user_not_found', lang) });

    res.json({ rating: user.rating, reviewsCount: user.reviewsCount });
  } catch (e) {
    const lang = getLang(req);
    console.error('userReviewsSummary', e);
    res.status(500).json({ message: t('server_error', lang) });
  }
};
