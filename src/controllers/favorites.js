import User from '../models/User.js';
import Ad from '../models/Ad.js';

export const toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: 'Объявление не найдено' });

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
      message: alreadyFavorite ? 'Удалено из избранного' : 'Добавлено в избранное',
      isFavorite: !alreadyFavorite,
      favoriteCount: ad.favoriteCount,
      ad,
    });
  } catch (err) {
    console.error('Ошибка обновления избранного:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'favorites',
      select: 'title price photos category location',
      populate: [
        { path: 'category', select: 'name' },
        { path: 'location', select: 'name' },
      ],
    });

    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    res.json(user.favorites);
  } catch (err) {
    console.error('Ошибка получения избранных:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const clearFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    if (user.favorites.length === 0) {
      return res.status(200).json({ message: 'Список избранного уже пуст' });
    }

    user.favorites = [];
    await user.save();

    res.json({ message: 'Все избранные объявления удалены', favorites: [] });
  } catch (err) {
    console.error('Ошибка очистки избранных:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};