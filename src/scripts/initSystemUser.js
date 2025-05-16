// 📁 scripts/initSystemUser.js
import bcrypt from "bcrypt";
import User from "../models/User.js";

export async function ensureSystemUser() {
  const SYSTEM_EMAIL = "balivito@gmail.com";

  // 1. Проверка по email
  const existing = await User.findOne({ email: SYSTEM_EMAIL });
  if (existing) {
    console.log("✅ Системный пользователь уже существует (по email):", existing._id);

    // 💾 Прямо в рантайме вставляем в process.env (внутри текущего процесса)
    process.env.SYSTEM_USER_ID = existing._id.toString();

    return;
  }

  // 2. Создание нового системного пользователя
  const rawPassword = "system_secret_" + Date.now();
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const systemUser = await User.create({
    name: "Balivito",
    email: SYSTEM_EMAIL,
    password: hashedPassword,
    isVerified: true,
  });

  console.log("✅ Создан системный пользователь:", systemUser._id);
  console.log("🔐 Пароль (отладка):", rawPassword);

  // 💾 Устанавливаем переменную в рантайме
  process.env.SYSTEM_USER_ID = systemUser._id.toString();
}
