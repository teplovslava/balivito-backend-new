import Category from "../models/Category.js";

export const categories = [
  { name: "Электроника", slug: "electronics" },
  { name: "Недвижимость", slug: "real-estate" },
  { name: "Услуги", slug: "services" },
  { name: "Транспорт", slug: "vehicles" },
  { name: "Одежда", slug: "clothing" },
  { name: "Другое", slug: "other" },
];
export async function ensureDefaultCategories() {
  for (const cat of categories) {
    const exists = await Category.findOne({ slug: cat.slug });
    if (!exists) {
      await Category.create(cat);
    }
  }
  return await Category.find();
}
