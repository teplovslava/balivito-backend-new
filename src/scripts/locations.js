import Location from "../models/Location.js";

export const locations = [
  { name: "Убуд", slug: "ubud" },
  { name: "Денпасар", slug: "denpasar" },
  { name: "Кута", slug: "kuta" },
  { name: "Чангу", slug: "changu" },
  { name: "Север", slug: "north" },
  { name: "Джимбаран", slug: "djimbaran" },
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
