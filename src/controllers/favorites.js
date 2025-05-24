import Ad from "../models/Ad.js";
import User from "../models/User.js";
import { messages } from "../langs/favorites.js";

function getFavoriteMessage(key, lang = 'en') {
  return messages[key]?.[lang] || messages[key]?.en || '';
}

function getLang(req) {
  return req.language || 'en';
}

export const toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;
    const lang = getLang(req);

    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ message: getFavoriteMessage('user_not_found', lang) });

    const ad = await Ad.findById(id)
      .select("title photos price location createdAt author favoriteUserIds favoriteCount")
      .populate("location", "name");
    if (!ad)
      return res.status(404).json({ message: getFavoriteMessage('ad_not_found', lang) });

    const alreadyFavorite = user.favorites.includes(id);

    if (!alreadyFavorite) {
      user.favorites.push(id);
      ad.favoriteUserIds.push(user._id);
    } else {
      user.favorites = user.favorites.filter(favId => favId.toString() !== id.toString());
      ad.favoriteUserIds = ad.favoriteUserIds.filter(uId => uId.toString() !== user._id.toString());
    }

    ad.favoriteCount = ad.favoriteUserIds.length;
    await user.save();
    await ad.save();

    res.json({
      message: alreadyFavorite
        ? getFavoriteMessage('removed', lang)
        : getFavoriteMessage('added', lang),
      isFavorite: !alreadyFavorite,
      favoriteCount: ad.favoriteCount,
      ad,
    });
  } catch (err) {
    console.error("Ошибка обновления избранного:", err);
    res.status(500).json({ message: getFavoriteMessage('server_error', getLang(req)) });
  }
};

export const getFavorites = async (req, res) => {
  try {
    const lang = getLang(req);
    const user = await User.findById(req.userId).populate({
      path: "favorites",
      select: "title price photos category location",
      populate: [
        { path: "category", select: "name" },
        { path: "location", select: "name" },
      ],
    });

    if (!user)
      return res.status(404).json({ message: getFavoriteMessage('user_not_found', lang) });

    res.json(user.favorites);
  } catch (err) {
    console.error("Ошибка получения избранных:", err);
    res.status(500).json({ message: getFavoriteMessage('server_error', getLang(req)) });
  }
};

export const clearFavorites = async (req, res) => {
  try {
    const lang = getLang(req);
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ message: getFavoriteMessage('user_not_found', lang) });

    if (user.favorites.length === 0) {
      return res.status(200).json({ message: getFavoriteMessage('already_empty', lang) });
    }

    user.favorites = [];
    await user.save();

    res.json({ message: getFavoriteMessage('all_cleared', lang), favorites: [] });
  } catch (err) {
    console.error("Ошибка очистки избранных:", err);
    res.status(500).json({ message: getFavoriteMessage('server_error', getLang(req)) });
  }
};
