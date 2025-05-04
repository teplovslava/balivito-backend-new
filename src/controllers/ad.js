import mongoose from 'mongoose';
import Ad from '../models/Ad.js';
import User from '../models/User.js'
import UploadedFile from '../models/UploadFile.js'
import fs from 'fs';
import path from 'path';
import { jaccardSimilarity, SIMILARITY_THRESHOLD } from '../utils/checkTitle.js';
import { getPaginatedAds } from '../utils/getPaginatedAds.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';

export const createAd = async (req, res) => {
  try {
    const { title, description, price, category, location } = req.body;

    const { usd, idr, rub } = price || {};

    // Проверка: хотя бы одна валюта задана
    if (usd == undefined && idr == undefined && rub == undefined) {
      return res.status(400).json({ message: 'Укажите хотя бы одну цену: usd, idr или rub' });
    }

    const existingAds = await Ad.find({ author: req.userId, category }).select('title');

    const dublicate = existingAds.find((ad) => {
      const similarity = jaccardSimilarity(ad.title, title);
      return similarity >= SIMILARITY_THRESHOLD;
    });

    if (dublicate) {
      return res.status(409).json({ message: 'Похоже, такое объявление уже существует', ad: dublicate });
    }

    const photoPaths = req.UploadedFile.map(file => ({
      id: file._id,
      url: file.url,
      filename: file.filename
    })) || [];

    const newAd = new Ad({
      title,
      description,
      price: { usd, idr, rub },
      category,
      location,
      photos: photoPaths,
      author: req.userId,
    });

    const savedAd = await newAd.save();
    res.status(201).json(savedAd);
  } catch (error) {
    console.error('Ошибка создания объявления:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getMyAds = async (req, res) => {
  try {
    const userId = req.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Некорректный пользователь' });
    }

    // Параметры запроса
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 'asc' : 'desc';

    // Фильтр по автору
    const filter = { author: userId };

    // Вызов общего метода пагинации
    const { ads, pagination } = await getPaginatedAds({
      filter,
      page,
      limit,
      sort: sortField,
      order: sortOrder,
      extraFields: 'favoriteCount'
    });

    return res.json({ items: ads, pagination });
  } catch (err) {
    console.error('Ошибка получения моих объявлений:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getAdById = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID' });
    }

    const ad = await Ad.findById(id)
      .populate('author', '-password -__v -createdAt -updatedAt')
      .populate('category', '-__v')
      .populate('location');

    if (!ad) {
      return res.status(404).json({ message: 'Объявление не найдено' });
    }

    if (viewerId && !ad.viewerIds.includes(viewerId)) {
      ad.viewerIds.push(viewerId);
      await ad.save();
    }

    await User.findByIdAndUpdate(viewerId, {
      $push: {
        viewedHistory: {
          $each: [{
            ad: ad._id,
            category: ad.category._id,
            location: ad.location._id,
            viewedAt: new Date(),
          }],
          $position: 0,
          $slice: 10,
        },
      },
    });

    let isFavorite = false;

    if (viewerId) {
      const user = await User.findById(viewerId).select('favorites');
      isFavorite = user.favorites.findIndex((fav) =>fav.toString() === id.toString()) > -1;
    }

    res.status(200).json({
      ...ad.toObject(),
      views: ad.viewerIds.length,
      isFavorite,
    });
  } catch (err) {
    console.error('Ошибка получения объявления:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getAds = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
      category,
      location,
      search,
    } = req.query;

    const viewerId = req.userId;

    const filter = { isArchived: false };

    if (category) filter.category = category;
    if (location) filter.location = location;
    if (search) {
      const escapedSearch = escapeRegExp(search);
      filter.title = { $regex: new RegExp(escapedSearch, 'i') };
    }

    const { ads, pagination } = await getPaginatedAds({
      filter,
      page: +page,
      limit: +limit,
      sort,
      order,
    });

    res.json({
      items: ads,
      pagination,
    });

    // Обновляем историю просмотров
    if (viewerId && ads.length) {
      const newHistoryItems = ads.slice(0, 5).map((ad) => ({
        ad: ad._id,
        category: ad.category._id,
        location: ad.location._id,
        viewedAt: new Date(),
      }));

      if (newHistoryItems.length > 0) {
        await User.findByIdAndUpdate(viewerId, {
          $push: {
            viewedHistory: {
              $each: newHistoryItems,
              $position: 0,
              $slice: 10,
            },
          },
        });
      }
    }
  } catch (err) {
    console.error('Ошибка получения объявлений:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Объявление не найдено' });
    }

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    if (ad.photos && ad.photos.length > 0) {
      for (const photo of ad.photos) {
        const localPath = path.join('uploads', photo.filename);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }

        await UploadedFile.deleteOne({ _id: photo.id, author: req.userId });
      }
    }

    await ad.deleteOne();

    res.json({ message: 'Объявление и связанные фото удалены' });
  } catch (err) {
    console.error('Ошибка удаления объявления:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;
    const { usd, idr, rub } = price || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID объявления' });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Объявление не найдено' });
    }

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: 'Нет прав на редактирование' });
    }

    // Валидация: если передан price, хотя бы одна валюта должна быть
    if (price && usd == null && idr == null && rub == null) {
      return res.status(400).json({ message: 'Укажите хотя бы одну цену' });
    }

    // Обновляем текстовые и категориальные поля
    const fieldsToUpdate = ['title', 'description', 'category', 'location'];
    fieldsToUpdate.forEach(field => {
      if (req.body[field] !== undefined) {
        ad[field] = req.body[field];
      }
    });

    // Обновление ценового объекта
    if (price) {
      ad.price = ad.price || {};
      if (usd !== undefined) ad.price.usd = usd;
      if (idr !== undefined) ad.price.idr = idr;
      if (rub !== undefined) ad.price.rub = rub;
    }

    // Обработка фотографий
    if (req.files && req.files.length > 0) {
      ad.photos.forEach(filename => {
        const filepath = path.join('uploads', filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      });

      ad.photos = req.uploadedFiles.map(file => ({
        id: file._id,
        url: file.url,
        filename: file.filename
      }));
    }

    const updated = await ad.save();
    res.json(updated);
  } catch (err) {
    console.error('Ошибка при редактировании:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getRecommendedAds = async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    if (!userId) {
      return res.status(400).json({ message: 'Неизвестный пользователь' });
    }

    const user = await User.findById(userId);
    const favorites = user?.favorites || [];

    // если нет истории просмотров — берём последние объявления
    if (!user || !user.viewedHistory?.length) {
      const filter = { author: { $ne: userId } };

      const { ads, pagination } = await getPaginatedAds({ filter, page, limit });

      const favoriteSet = new Set(favorites.map(fav => fav.toString()));
      const items = ads.map(ad => ({
        ...ad.toObject(),
        isFavorite: favoriteSet.has(ad._id.toString()),
      }));

      return res.json({ items, pagination });
    }

    // рекомендационная логика
    const scoreMap = {};
    const now = Date.now();

    for (const view of user.viewedHistory) {
      const timeDiff = (now - new Date(view.viewedAt).getTime()) / (1000 * 60 * 60); // в часах
      const score = Math.max(1, 24 - timeDiff);

      if (view.category) {
        scoreMap[`cat:${view.category}`] = (scoreMap[`cat:${view.category}`] || 0) + score;
      }
      if (view.location) {
        scoreMap[`loc:${view.location}`] = (scoreMap[`loc:${view.location}`] || 0) + score;
      }
    }

    const topCategories = Object.entries(scoreMap)
      .filter(([k]) => k.startsWith('cat:'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k.split(':')[1]);

    const topLocations = Object.entries(scoreMap)
      .filter(([k]) => k.startsWith('loc:'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k.split(':')[1]);

    const filter = {
      $or: [
        { category: { $in: topCategories } },
        { location: { $in: topLocations } },
      ],
      author: { $ne: userId },
      isArchived: false,
    };

    const { ads, pagination } = await getPaginatedAds({ filter, page, limit });

    const favoriteSet = new Set(favorites.map(fav => fav.toString()));
    const items = ads.map(ad => ({
      ...ad.toObject(),
      isFavorite: favoriteSet.has(ad._id.toString()),
    }));

    console.log({ items, pagination })

    res.json({ items, pagination });

  } catch (err) {
    console.error('Ошибка получения рекомендаций:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getSearchSuggestions = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 1) {
      return res.json([]);
    }

    const escapedQuery = escapeRegExp(query);

    const suggestions = await Ad.aggregate([
      {
        $match: {
          title: {
            $regex: new RegExp(escapedQuery, 'i'),
          },
        },
      },
      {
        $group: {
          _id: '$title',
        },
      },
      {
        $limit: 10,
      },
      {
        $project: {
          _id: 0,
          title: '$_id',
        },
      },
    ]);

    res.json(suggestions.map((s) => s.title));
  } catch (err) {
    console.error('Ошибка подсказок:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const archiveAd = async (req, res) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: 'Объявление не найдено' });

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: 'Нет прав на архивирование этого объявления' });
    }

    ad.isArchived = true;
    await ad.save();

    res.json({ message: 'Объявление архивировано', ad });
  } catch (err) {
    console.error('Ошибка архивирования объявления:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const unarchiveAd = async (req, res) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: 'Объявление не найдено' });

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: 'Нет прав на восстановление этого объявления' });
    }

    ad.isArchived = false;
    await ad.save();

    res.json({ message: 'Объявление восстановлено из архива', ad });
  } catch (err) {
    console.error('Ошибка восстановления объявления:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
