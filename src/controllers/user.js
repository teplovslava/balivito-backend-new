import User from "../models/User.js";

export const getAllUsers = async (req, res) => {
  const users = await User.find();
  res.json(users);
};

export const createUser = async (req, res) => {
  const user = new User(req.body);
  await user.save();
  res.status(201).json(user);
};

export const updatePushToken = async (req, res) => {
  try {
    console.log(req.userId, token);
    const userId = req.userId;
    const { token } = req.body;
    await User.findByIdAndUpdate(userId, { expoPushToken: token });
    res.json({ success: true });
  } catch (e) {
    console.error("Ошибка при обновлении push token:", e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};
