import Category from "../models/Category.js";

// Категории с переводами
export const categories = [
  { name: { en: "Real Estate", ru: "Недвижимость", id: "Properti", bjn: "Properti" }, slug: "real-estate" },
  { name: { en: "Rooms & Villas for Rent", ru: "Аренда комнат и вилл", id: "Sewa Kamar & Vila", bjn: "Sewa Kamar & Vila" }, slug: "rooms-villas-rent" },
  { name: { en: "Vehicles", ru: "Транспорт", id: "Kendaraan", bjn: "Kandaraan" }, slug: "vehicles" },
  { name: { en: "Motorcycles", ru: "Мотоциклы", id: "Motor", bjn: "Motor" }, slug: "motorcycles" },
  { name: { en: "Vehicle Accessories", ru: "Аксессуары для транспорта", id: "Aksesoris Kendaraan", bjn: "Aksesoris Kandaraan" }, slug: "vehicle-accessories" },
  { name: { en: "Electronics", ru: "Электроника", id: "Elektronik", bjn: "Elektronik" }, slug: "electronics" },
  { name: { en: "Clothing & Shoes", ru: "Одежда и обувь", id: "Pakaian & Sepatu", bjn: "Baju & Sapatu" }, slug: "clothing-shoes" },
  { name: { en: "Surf & Sports Gear", ru: "Серф и спортинвентарь", id: "Peralatan Surf & Olahraga", bjn: "Alat Surf & Olahraga" }, slug: "surf-sports" },
  { name: { en: "Home & Garden", ru: "Дом и сад", id: "Rumah & Taman", bjn: "Rumah & Taman" }, slug: "home-garden" },
  { name: { en: "Children's Goods", ru: "Детские товары", id: "Barang Anak", bjn: "Barataan Anak" }, slug: "children-goods" },
  { name: { en: "Beauty & Health", ru: "Красота и здоровье", id: "Kecantikan & Kesehatan", bjn: "Kecantikan & Kesehatan" }, slug: "beauty-health" },
  { name: { en: "Food", ru: "Еда", id: "Makanan", bjn: "Panganan" }, slug: "food" },
  { name: { en: "Pets", ru: "Животные", id: "Hewan", bjn: "Sapatawan" }, slug: "pets" },
  { name: { en: "Services", ru: "Услуги", id: "Layanan", bjn: "Layanan" }, slug: "services" },
  { name: { en: "Jobs", ru: "Работа", id: "Pekerjaan", bjn: "Pagawean" }, slug: "jobs" },
  { name: { en: "Business", ru: "Бизнес", id: "Bisnis", bjn: "Bisnis" }, slug: "business" },
  { name: { en: "Other", ru: "Другое", id: "Lainnya", bjn: "Lainnya" }, slug: "other" },
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
