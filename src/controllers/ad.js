import mongoose from 'mongoose';
import Ad from '../models/Ad.js';
import User from '../models/User.js'
import fs from 'fs';
import path from 'path';
import { jaccardSimilarity, SIMILARITY_THRESHOLD } from '../utils/checkTitle.js';

export const createAd = async (req, res) => {
  try {
    const { title, description, price, category, location } = req.body;
    const existingAds = await Ad.find({ author: req.userId, category }).select('title');

    const dublicate = existingAds.find((ad) => {
      const similarity = jaccardSimilarity(ad.title, title);
      return similarity >= SIMILARITY_THRESHOLD;
    });

    if (dublicate) {
      return res.status(409).json({ message: 'Похоже, такое объявление уже существует', ad: dublicate });
    }

    const photoPaths = req.files?.map(file => `${process.env.SITE_URL}/uploads/${file.filename}`) || [];

    const newAd = new Ad({
      title,
      description,
      price,
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
      isFavorite = user.favorites.findIndex(fav.toString() === id.toString()) > -1;
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
    const query = {};

    if (category) query.category = category;
    if (location) query.location = location;
    if (search) {
      query.title = { $regex: new RegExp(search, 'i') };
      
    }

    const ads = await Ad.find(query)
      .populate('category', 'name')
      .populate('location', 'name')
      .sort({ [sort]: order === 'desc' ? -1 : 1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    const total = await Ad.countDocuments(query);

    res.json({
      items: ads,
      total,
      page: +page,
      pages: Math.ceil(total / +limit),
    });

    if(viewerId && ads.length) {
      const newHistoryItems = ads.slice(0, 5).map(ad => ({
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
      for (const photoUrl of ad.photos) {
        const localPath = path.join('uploads', path.basename(photoUrl));
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
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

    // Обновляем текстовые поля
    const fieldsToUpdate = ['title', 'description', 'price', 'category', 'location'];
    fieldsToUpdate.forEach(field => {
      if (req.body[field] !== undefined) {
        ad[field] = req.body[field];
      }
    });

    if (req.files && req.files.length > 0) {
      ad.photos.forEach(filename => {
        const filepath = path.join('uploads', filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      });

      ad.photos = req.files.map(file => file.filename);
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
    const skip = (page - 1) * limit;

    if (!userId) {
      return res.status(400).json({ message: 'Неизвестный пользователь' });
    }

    const user = await User.findById(userId);

    if (!user || !user.viewedHistory?.length) {
      const latestAds = await Ad.find({ author: { $ne: userId } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('location', 'name')
        .populate('category', 'name')
        .select('title price photos location category');

      const favoriteSet = new Set(user.favorites.map(fav => fav.toString()));
      const adsWithFavorites = latestAds.map(ad => ({
        ...ad.toObject(),
        isFavorite: favoriteSet.has(ad._id.toString()),
      }));

      return res.json(adsWithFavorites);
    }

    // ─────── рекомендационная логика ─────── //
    const scoreMap = {};
    const now = Date.now();

    for (const view of user.viewedHistory) {
      const timeDiff = (now - new Date(view.viewedAt).getTime()) / (1000 * 60 * 60); // часы
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

    const recommendedAds = await Ad.find({
      $or: [
        { category: { $in: topCategories } },
        { location: { $in: topLocations } },
      ],
      author: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('location', 'name')
      .populate('category', 'name')
      .select('title price photos location category');

    const favoriteSet = new Set(user.favorites.map(fav => fav.toString()));
    const adsWithFavorites = recommendedAds.map(ad => ({
      ...ad.toObject(),
      isFavorite: favoriteSet.has(ad._id.toString()),
    }));

    res.json(adsWithFavorites);
  } catch (err) {
    console.error('Ошибка получения рекомендаций:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};


