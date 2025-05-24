import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import Ad from "../models/Ad.js";
import UploadedFile from "../models/UploadFile.js";
import User from "../models/User.js";
import {
  jaccardSimilarity,
  SIMILARITY_THRESHOLD,
} from "../utils/checkTitle.js";
import { escapeRegExp } from "../utils/escapeRegExp.js";
import { getPaginatedAds } from "../utils/getPaginatedAds.js";

// --- ХЕЛПЕР: Получить имя поля на нужном языке (category, location)
function getNameByLang(field, lang = 'en') {
  console.log(field.name)
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (field.name && typeof field.name === 'object') {
    return field.name[lang] || field.name['en'] || '';
  }
  return '';
}

// --- ХЕЛПЕР: Трансформировать объявление для выдачи клиенту
function transformAd(ad, lang = 'en') {
  const plainAd = ad.toObject ? ad.toObject() : ad;
  return {
    ...plainAd,
    category: getNameByLang(plainAd.category, lang),
    location: getNameByLang(plainAd.location, lang),
  };
}

export const createAd = async (req, res) => {
  try {
    const { title, description, price, category, location } = req.body;
    const { usd, idr, rub } = price || {};

    if (usd == undefined && idr == undefined && rub == undefined) {
      return res
        .status(400)
        .json({ message: "Укажите хотя бы одну цену: usd, idr или rub" });
    }

    const existingAds = await Ad.find({ author: req.userId, category }).select("title");
    const dublicate = existingAds.find((ad) => {
      const similarity = jaccardSimilarity(ad.title, title);
      return similarity >= SIMILARITY_THRESHOLD;
    });

    if (dublicate) {
      return res.status(409).json({
        message: "Похоже, такое объявление уже существует",
        ad: dublicate,
      });
    }

    const photoPaths =
      req.uploadedFiles?.map((file) => ({
        id: file._id,
        uri: file.uri,
        filename: file.filename,
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

    // Пополняем связки и возвращаем трансформированный ad
    const populatedAd = await savedAd
      .populate("category", "-__v")
      .populate("location")
      .populate("author", "-password -__v -createdAt -updatedAt")
      .execPopulate?.() || savedAd;

    const lang = req.language || 'en';
    res.status(201).json(transformAd(populatedAd, lang));
  } catch (error) {
    console.error("Ошибка создания объявления:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getMyAds = async (req, res) => {
  try {
    const userId = req.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Некорректный пользователь" });
    }

    // Параметры запроса
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortField = req.query.sort || "createdAt";
    const sortOrder = req.query.order === "asc" ? "asc" : "desc";
    const filter = { author: userId };

    const { ads, pagination } = await getPaginatedAds({
      filter,
      page,
      limit,
      sort: sortField,
      order: sortOrder,
      extraFields: "favoriteCount isArchived",
    });

    const lang = req.language || 'en';
    return res.json({
      items: ads.map(ad => transformAd(ad, lang)),
      pagination,
    });
  } catch (err) {
    console.error("Ошибка получения моих объявлений:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getAdById = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Некорректный ID" });
    }

    const ad = await Ad.findById(id)
      .populate("author", "-password -__v -createdAt -updatedAt")
      .populate("category", "-__v")
      .populate("location");

    if (!ad) {
      return res.status(404).json({ message: "Объявление не найдено" });
    }

    if (viewerId && !ad.viewerIds.includes(viewerId)) {
      ad.viewerIds.push(viewerId);
      await ad.save();
    }

    await User.findByIdAndUpdate(viewerId, {
      $push: {
        viewedHistory: {
          $each: [
            {
              ad: ad._id,
              category: ad.category._id,
              location: ad.location._id,
              viewedAt: new Date(),
            },
          ],
          $position: 0,
          $slice: 10,
        },
      },
    });

    let isFavorite = false;
    if (viewerId) {
      console.log(viewerId)
      const user = await User.findById(viewerId).select("favorites");
      isFavorite =
        user.favorites.findIndex((fav) => fav.toString() === id.toString()) > -1;
    }

    const lang = req.language || 'en';
    res.status(200).json({
      ...transformAd(ad, lang),
      views: ad.viewerIds.length,
      isFavorite,
    });
  } catch (err) {
    console.error("Ошибка получения объявления:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getAds = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
      category,
      location,
      search,
      minPrice,
      maxPrice,
      currency,
    } = req.query;

    const viewerId = req.userId;
    const filter = { isArchived: false };

    if (category) filter.category = category;
    if (location) filter.location = location;
    if (search) {
      const escapedSearch = escapeRegExp(search);
      filter.title = { $regex: new RegExp(escapedSearch, "i") };
    }

    if (currency && (minPrice || maxPrice)) {
      filter[`price.${currency}`] = {};
      if (minPrice !== undefined && minPrice !== "") {
        filter[`price.${currency}`].$gte = Number(minPrice);
      }
      if (maxPrice !== undefined && maxPrice !== "") {
        filter[`price.${currency}`].$lte = Number(maxPrice);
      }
      if (Object.keys(filter[`price.${currency}`]).length === 0) {
        delete filter[`price.${currency}`];
      }
    }

    const sortField = sort || "createdAt";
    const sortOrder = order === "asc" ? 1 : -1;
    let sortObj = {};
    if (sortField === 'price' && currency) {
      sortObj[`price.${currency}`] = sortOrder;
    } else {
      sortObj[sortField] = sortOrder;
    }
    const skip = (Number(page) - 1) * Number(limit);

    const ads = await Ad.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit))
      .populate("author", "-password -__v -createdAt -updatedAt")
      .populate("category", "-__v")
      .populate("location");

    const total = await Ad.countDocuments(filter);
    const pagination = {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    };

    const lang = req.language || 'en';

    res.json({
      items: ads.map(ad => transformAd(ad, lang)),
      pagination,
    });

    if (viewerId && ads.length) {
      const newHistoryItems = ads.slice(0, 5).map((ad) => ({
        ad: ad._id,
        category: ad.category?._id,
        location: ad.location?._id,
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
    console.error("Ошибка получения объявлений:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: "Объявление не найдено" });
    }

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: "Нет доступа" });
    }

    if (ad.photos && ad.photos.length > 0) {
      for (const photo of ad.photos) {
        const localPath = path.join("uploads", photo.filename);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }

        await UploadedFile.deleteOne({ _id: photo.id, author: req.userId });
      }
    }

    await ad.deleteOne();

    res.json({ message: "Объявление и связанные фото удалены" });
  } catch (err) {
    console.error("Ошибка удаления объявления:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;
    const { usd, idr, rub } = price || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Некорректный ID объявления" });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: "Объявление не найдено" });
    }

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: "Нет прав на редактирование" });
    }

    if (price && usd == null && idr == null && rub == null) {
      return res.status(400).json({ message: "Укажите хотя бы одну цену" });
    }

    ["title", "description", "category", "location"].forEach((field) => {
      if (req.body[field] !== undefined) ad[field] = req.body[field];
    });

    if (price) {
      ad.price = ad.price || {};
      if (usd !== undefined) ad.price.usd = usd;
      if (idr !== undefined) ad.price.idr = idr;
      if (rub !== undefined) ad.price.rub = rub;
    }

    // Обработка фотографий через req.uploadedFiles
    if (Array.isArray(req.uploadedFiles) && req.uploadedFiles.length > 0) {
      // ✅ НЕ удаляем старые — потому что они уже повторно прикреплены и обработаны
      ad.photos = req.uploadedFiles.map((file) => ({
        id: file._id,
        uri: file.uri,
        filename: file.filename,
      }));
    }

    const updated = await ad.save();
    res.json(updated);
  } catch (err) {
    console.error("Ошибка при редактировании:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getRecommendedAds = async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    if (!userId) {
      return res.status(400).json({ message: "Неизвестный пользователь" });
    }

    const user = await User.findById(userId);
    const favorites = user?.favorites || [];

    if (!user || !user.viewedHistory?.length) {
      const filter = { author: { $ne: userId } };
      const { ads, pagination } = await getPaginatedAds({
        filter,
        page,
        limit,
      });
      const favoriteSet = new Set(favorites.map((fav) => fav.toString()));

      const lang = req.language || 'en';
      const items = ads.map((ad) => ({
        ...transformAd(ad, lang),
        isFavorite: favoriteSet.has(ad._id.toString()),
      }));

      return res.json({ items, pagination });
    }

    // рекомендационная логика
    const scoreMap = {};
    const now = Date.now();
    for (const view of user.viewedHistory) {
      const timeDiff =
        (now - new Date(view.viewedAt).getTime()) / (1000 * 60 * 60);
      const score = Math.max(1, 24 - timeDiff);

      if (view.category) {
        scoreMap[`cat:${view.category}`] =
          (scoreMap[`cat:${view.category}`] || 0) + score;
      }
      if (view.location) {
        scoreMap[`loc:${view.location}`] =
          (scoreMap[`loc:${view.location}`] || 0) + score;
      }
    }

    const topCategories = Object.entries(scoreMap)
      .filter(([k]) => k.startsWith("cat:"))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k.split(":")[1]);

    const topLocations = Object.entries(scoreMap)
      .filter(([k]) => k.startsWith("loc:"))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k.split(":")[1]);

    const filter = {
      $or: [
        { category: { $in: topCategories } },
        { location: { $in: topLocations } },
      ],
      author: { $ne: userId },
      isArchived: false,
    };

    const { ads, pagination } = await getPaginatedAds({ filter, page, limit });

    const favoriteSet = new Set(favorites.map((fav) => fav.toString()));
    const lang = req.language || 'en';
    const items = ads.map((ad) => ({
      ...transformAd(ad, lang),
      isFavorite: favoriteSet.has(ad._id.toString()),
    }));

    res.json({ items, pagination });
  } catch (err) {
    console.error("Ошибка получения рекомендаций:", err);
    res.status(500).json({ message: "Ошибка сервера" });
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
            $regex: new RegExp(escapedQuery, "i"),
          },
        },
      },
      {
        $group: {
          _id: "$title",
        },
      },
      {
        $limit: 10,
      },
      {
        $project: {
          _id: 0,
          title: "$_id",
        },
      },
    ]);

    res.json(suggestions.map((s) => s.title));
  } catch (err) {
    console.error("Ошибка подсказок:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const archiveAd = async (req, res) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: "Объявление не найдено" });

    if (ad.author.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "Нет прав на архивирование этого объявления" });
    }

    ad.isArchived = true;
    await ad.save();

    res.json({ message: "Объявление архивировано", ad });
  } catch (err) {
    console.error("Ошибка архивирования объявления:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const unarchiveAd = async (req, res) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: "Объявление не найдено" });

    if (ad.author.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: "Нет прав на восстановление этого объявления" });
    }

    ad.isArchived = false;
    await ad.save();

    res.json({ message: "Объявление восстановлено из архива", ad });
  } catch (err) {
    console.error("Ошибка восстановления объявления:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

