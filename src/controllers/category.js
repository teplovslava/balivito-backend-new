import Category from "../models/Category.js";

export const getCategories = async (req, res) => {
  try {
    const lang = req.language || 'en';
    const categories = await Category.find();
    res.json(categories.map(cat => ({
      _id: cat._id,
      name: cat.name.get(lang) || cat.name.get('en'),
      slug: cat.slug,
    })));
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

