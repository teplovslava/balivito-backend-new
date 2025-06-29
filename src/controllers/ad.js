import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import Ad from "../models/Ad.js";
import UploadedFile from "../models/UploadFile.js";
import User from "../models/User.js";
import { jaccardSimilarity, SIMILARITY_THRESHOLD } from "../utils/checkTitle.js";
import { escapeRegExp } from "../utils/escapeRegExp.js";
import { getPaginatedAds } from "../utils/getPaginatedAds.js";
import { messages } from "../langs/ads.js";

function getErrorMessage(key, lang = "en") {
  return (messages[key] && messages[key][lang]) || (messages[key] && messages[key].en) || key;
}

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

function transformAd(ad, lang = 'en') {
  const plainAd = ad.toObject ? ad.toObject() : ad;
  return {
    ...plainAd,
    category: plainAd.category && {
      id: plainAd.category._id,
      slug: plainAd.category.slug,
      name: getNameByLang(plainAd.category, lang)
    },
    location: plainAd.location && {
      id: plainAd.location._id,
      slug: plainAd.location.slug,
      name: getNameByLang(plainAd.location, lang)
    }
  };
}

export const createAd = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { title, description, price, category, location } = req.body;
    const { usd, idr, rub } = price || {};

    if (usd == undefined && idr == undefined && rub == undefined) {
      return res
        .status(400)
        .json({ message: getErrorMessage("missing_price", lang) });
    }

    const existingAds = await Ad.find({ author: req.userId, category }).select("title");
    const dublicate = existingAds.find((ad) => {
      const similarity = jaccardSimilarity(ad.title, title);
      return similarity >= SIMILARITY_THRESHOLD;
    });

    if (dublicate) {
      return res.status(409).json({
        message: getErrorMessage("duplicate_ad", lang),
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

    const populatedAd = await Ad.findById(savedAd._id)
      .populate("category", "-__v")
      .populate("location")
      .populate("author", "-password -__v -createdAt -updatedAt");

    res.status(201).json(transformAd(populatedAd, lang));
  } catch (error) {
    console.error("Ошибка создания объявления:", error);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const getMyAds = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const userId = req.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: getErrorMessage("invalid_user", lang) });
    }
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

    return res.json({
      items: ads.map(ad => transformAd(ad, lang)),
      pagination,
    });
  } catch (err) {
    console.error("Ошибка получения моих объявлений:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const getAdById = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { id } = req.params;
    const viewerId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: getErrorMessage("invalid_id", lang) });
    }

    const ad = await Ad.findById(id)
      .populate("author", "-password -__v -createdAt -updatedAt")
      .populate("category", "-__v")
      .populate("location");

    if (!ad) {
      return res.status(404).json({ message: getErrorMessage("ad_not_found", lang) });
    }

    if (viewerId && !ad.viewerIds.includes(viewerId)) {
      ad.viewerIds.push(viewerId);
      await ad.save();
    }

    if (viewerId) {
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
    }

    let isFavorite = false;
    if (viewerId) {
      const user = await User.findById(viewerId).select("favorites");
      isFavorite = !!(user && user.favorites.findIndex((fav) => fav.toString() === id.toString()) > -1);
    }

    res.status(200).json({
      ...transformAd(ad, lang),
      views: ad.viewerIds.length,
      isFavorite,
    });
  } catch (err) {
    console.error("Ошибка получения объявления:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const getAds = async (req, res) => {
  const lang = req.language || 'en';
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
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const deleteAd = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: getErrorMessage("ad_not_found", lang) });
    }

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: getErrorMessage("no_access", lang) });
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

    res.json({ message: getErrorMessage("ad_archived", lang) });
  } catch (err) {
    console.error("Ошибка удаления объявления:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const updateAd = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { id } = req.params;
    const { price } = req.body;
    const { usd, idr, rub } = price || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: getErrorMessage("invalid_id", lang) });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: getErrorMessage("ad_not_found", lang) });
    }

    if (ad.author.toString() !== req.userId) {
      return res.status(403).json({ message: getErrorMessage("edit_no_rights", lang) });
    }

    if (price && usd == null && idr == null && rub == null) {
      return res.status(400).json({ message: getErrorMessage("must_have_price", lang) });
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

    if (Array.isArray(req.uploadedFiles) && req.uploadedFiles.length > 0) {
      ad.photos = req.uploadedFiles.map((file) => ({
        id: file._id,
        uri: file.uri,
        filename: file.filename,
      }));
    }

    const updated = await ad.save();
    res.json(transformAd(updated, lang));
  } catch (err) {
    console.error("Ошибка при редактировании:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const getAdsByUserId = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { userId } = req.params;

    // Параметры пагинации (по аналогии с другими ручками)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    // Формируем фильтр — только не архивированные объявления пользователя
    const filter = {
      author: userId,
      isArchived: false,
    };

    // Считаем всего объявлений по фильтру
    const total = await Ad.countDocuments(filter);

    // Считаем количество страниц
    const totalPages = Math.ceil(total / limit);

    // Достаём объявления с учётом пагинации
    const ads = await Ad.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("location")

    // Отдаём ответ
    res.json({
      items: ads.map(ad => transformAd(ad, lang)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error("Ошибка получения объявлений пользователя:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};


export const getRecommendedAds = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    if (!userId) {
      return res.status(400).json({ message: getErrorMessage("unknown_user", lang) });
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
    const items = ads.map((ad) => ({
      ...transformAd(ad, lang),
      isFavorite: favoriteSet.has(ad._id.toString()),
    }));

    res.json({ items, pagination });
  } catch (err) {
    console.error("Ошибка получения рекомендаций:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
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
    res.status(500).json({ message: getErrorMessage("server_error", req.language || 'en') });
  }
};

export const archiveAd = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: getErrorMessage("ad_not_found", lang) });

    if (ad.author.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: getErrorMessage("no_archive_rights", lang) });
    }

    ad.isArchived = true;
    await ad.save();

    res.json({ message: getErrorMessage("ad_archived", lang), ad: transformAd(ad, lang) });
  } catch (err) {
    console.error("Ошибка архивирования объявления:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const unarchiveAd = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { id } = req.params;

    const ad = await Ad.findById(id);
    if (!ad) return res.status(404).json({ message: getErrorMessage("ad_not_found", lang) });

    if (ad.author.toString() !== req.userId) {
      return res
        .status(403)
        .json({ message: getErrorMessage("no_restore_rights", lang) });
    }

    ad.isArchived = false;
    await ad.save();

    res.json({ message: getErrorMessage("ad_restored", lang), ad: transformAd(ad, lang) });
  } catch (err) {
    console.error("Ошибка восстановления объявления:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};
