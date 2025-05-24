import Ad from "../models/Ad.js";
import User from "../models/User.js";
import { messages } from "../langs/favorites.js";

// Универсальный хелпер
function getNameByLang(field, lang = 'en') {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (field instanceof Map) {
    return field.get(lang) || field.get('en') || '';
  }
  if (field.name && typeof field.name === 'object') {
    if (field.name instanceof Map) {
      return field.name.get(lang) || field.name.get('en') || '';
    }
    return field.name[lang] || field.name['en'] || '';
  }
  if (typeof field === 'object') {
    return field[lang] || field['en'] || '';
  }
  return '';
}

function getFavoriteMessage(key, lang = 'en') {
  return messages[key]?.[lang] || messages[key]?.en || '';
}

function getLang(req) {
  return req.language || 'en';
}

// Трансформатор объявления
function transformAd(ad, lang = 'en') {
  const plainAd = ad.toObject ? ad.toObject() : ad;
  return {
    ...plainAd,
    category: plainAd.category
      ? {
          id: plainAd.category._id,
          slug: plainAd.category.slug,
          name: getNameByLang(plainAd.category, lang),
        }
      : null,
    location: plainAd.location
      ? {
          id: plainAd.location._id,
          slug: plainAd.location.slug,
          name: getNameByLang(plainAd.location, lang),
        }
      : null,
  };
}

export const toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;
    const lang = getLang(req);

    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ message: getFavoriteMessage('user_not_found', lang) });

    const ad = await Ad.findById(id)
      .select("title photos price location createdAt author favoriteUserIds favoriteCount category")
      .populate("location")
      .populate("category");
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
      ad: transformAd(ad, lang),
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
        { path: "category" },
        { path: "location" },
      ],
    });

    if (!user)
      return res.status(404).json({ message: getFavoriteMessage('user_not_found', lang) });

    // Преобразуем объявления под нужный язык
    const favorites = user.favorites.map(ad => transformAd(ad, lang));
    res.json(favorites);
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
