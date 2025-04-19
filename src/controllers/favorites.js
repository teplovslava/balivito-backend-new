import User from '../models/User.js';
import Ad from '../models/Ad.js';

export const toggleFavorite = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const { id } = req.params;

    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: 'Объявление не найдено' });

    const index = user.favorites.indexOf(id);

    if (index === -1) {
      user.favorites.push(id);
    } else {
      user.favorites.splice(index, 1);
    }

    await user.save();

    res.json({ message: index === -1 ? 'Добавлено в избранное' : 'Удалено из избранного', isFavorite: index === -1 });
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

    res.json({ items: user.favorites });
  } catch (err) {
    console.error('Ошибка получения избранных:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
