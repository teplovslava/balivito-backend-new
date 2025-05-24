import Location from "../models/Location.js";

export const locations = [
  { name: { en: "Ubud", ru: "Убуд", id: "Ubud", bjn: "Ubud" }, slug: "ubud" },
  { name: { en: "Denpasar", ru: "Денпасар", id: "Denpasar", bjn: "Denpasar" }, slug: "denpasar" },
  { name: { en: "Kuta", ru: "Кута", id: "Kuta", bjn: "Kuta" }, slug: "kuta" },
  { name: { en: "Canggu", ru: "Чангу", id: "Canggu", bjn: "Canggu" }, slug: "canggu" },
  { name: { en: "Seminyak", ru: "Семиньяк", id: "Seminyak", bjn: "Seminyak" }, slug: "seminyak" },
  { name: { en: "Legian", ru: "Легиан", id: "Legian", bjn: "Legian" }, slug: "legian" },
  { name: { en: "Sanur", ru: "Санур", id: "Sanur", bjn: "Sanur" }, slug: "sanur" },
  { name: { en: "Nusa Dua", ru: "Нуса Дуа", id: "Nusa Dua", bjn: "Nusa Dua" }, slug: "nusa-dua" },
  { name: { en: "Jimbaran", ru: "Джимбаран", id: "Jimbaran", bjn: "Jimbaran" }, slug: "jimbaran" },
  { name: { en: "Uluwatu", ru: "Улувату", id: "Uluwatu", bjn: "Uluwatu" }, slug: "uluwatu" },
  { name: { en: "Bukit", ru: "Букит", id: "Bukit", bjn: "Bukit" }, slug: "bukit" },
  { name: { en: "Nusa Penida", ru: "Нуса Пенида", id: "Nusa Penida", bjn: "Nusa Penida" }, slug: "nusa-penida" },
  { name: { en: "Nusa Lembongan", ru: "Нуса Лембонган", id: "Nusa Lembongan", bjn: "Nusa Lembongan" }, slug: "nusa-lembongan" },
  { name: { en: "Tabanan", ru: "Табанан", id: "Tabanan", bjn: "Tabanan" }, slug: "tabanan" },
  { name: { en: "Kerobokan", ru: "Керобокан", id: "Kerobokan", bjn: "Kerobokan" }, slug: "kerobokan" },
  { name: { en: "Singaraja", ru: "Сингараджа", id: "Singaraja", bjn: "Singaraja" }, slug: "singaraja" },
  { name: { en: "Lovina", ru: "Ловина", id: "Lovina", bjn: "Lovina" }, slug: "lovina" },
  { name: { en: "Amed", ru: "Амед", id: "Amed", bjn: "Amed" }, slug: "amed" },
  { name: { en: "Tulamben", ru: "Туламбен", id: "Tulamben", bjn: "Tulamben" }, slug: "tulamben" },
  { name: { en: "Padangbai", ru: "Падангбай", id: "Padangbai", bjn: "Padangbai" }, slug: "padangbai" },
  { name: { en: "Gianyar", ru: "Гианьяр", id: "Gianyar", bjn: "Gianyar" }, slug: "gianyar" },
  { name: { en: "Bangli", ru: "Бангли", id: "Bangli", bjn: "Bangli" }, slug: "bangli" },
  { name: { en: "Klungkung", ru: "Клунгкунг", id: "Klungkung", bjn: "Klungkung" }, slug: "klungkung" },
  { name: { en: "Karangasem", ru: "Карангасем", id: "Karangasem", bjn: "Karangasem" }, slug: "karangasem" },
  { name: { en: "Bangsal", ru: "Бангсал", id: "Bangsal", bjn: "Bangsal" }, slug: "bangsal" },
  { name: { en: "Pemuteran", ru: "Пемутаран", id: "Pemuteran", bjn: "Pemuteran" }, slug: "pemuteran" },
  { name: { en: "Menjangan", ru: "Менджанган", id: "Menjangan", bjn: "Menjangan" }, slug: "menjangan" },
  { name: { en: "Bedugul", ru: "Бедугул", id: "Bedugul", bjn: "Bedugul" }, slug: "bedugul" },
  { name: { en: "Munduk", ru: "Мундук", id: "Munduk", bjn: "Munduk" }, slug: "munduk" },
  { name: { en: "Tabanan", ru: "Табанан", id: "Tabanan", bjn: "Tabanan" }, slug: "tabanan" },
  { name: { en: "Seririt", ru: "Серирит", id: "Seririt", bjn: "Seririt" }, slug: "seririt" },
  { name: { en: "Negara", ru: "Негара", id: "Negara", bjn: "Negara" }, slug: "negara" },
  { name: { en: "Bangli", ru: "Бангли", id: "Bangli", bjn: "Bangli" }, slug: "bangli" },
  { name: { en: "Other", ru: "Другое", id: "Lainnya", bjn: "Lainnya" }, slug: "other" }
];

export async function ensureDefaultLocations() {
  for (const loc of locations) {
    const exists = await Location.findOne({ slug: loc.slug });
    if (!exists) {
      await Location.create(loc);
    }
  }
  return Location.find();
}