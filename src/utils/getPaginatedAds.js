import Ad from "../models/Ad.js";

export const getPaginatedAds = async ({
  filter = {},
  page = 1,
  limit = 30,
  extraFields = "",
}) => {
  const skip = (page - 1) * limit;

  const [total, ads] = await Promise.all([
    Ad.countDocuments(filter),
    Ad.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .populate("location", "name")
      .populate("category", "name")
      .select(`title price photos location category ${extraFields}`),
  ]);

  return {
    ads, // просто отдаём данные
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
