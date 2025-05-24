import Location from "../models/Location.js";

export const getLocations = async (req, res) => {
  try {
    const lang = req.language || 'en';
    const locations = await Location.find();
    res.json(
      locations.map(loc => ({
        _id: loc._id,
        name: loc.name.get(lang) || loc.name.get('en'),
        slug: loc.slug,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch locations" });
  }
};
