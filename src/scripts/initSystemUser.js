// 📁 scripts/initSystemUser.js
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import User from "../models/User.js";

export async function ensureSystemUser() {
  const SYSTEM_EMAIL = "balivito@gmail.com";
  const ENV_PATH = path.resolve(process.cwd(), ".env");

  // 1. Проверка по email
  const existing = await User.findOne({ email: SYSTEM_EMAIL });
  if (existing) {
    console.log("✅ Системный пользователь уже существует (по email):", existing._id);

    // 🔁 Пытаемся записать в .env, если его ещё нет
    try {
      if (!fs.existsSync(ENV_PATH)) {
        fs.writeFileSync(ENV_PATH, `SYSTEM_USER_ID=${existing._id}\n`, "utf-8");
        console.log("📄 .env создан и SYSTEM_USER_ID добавлен");
      } else {
        const envContent = fs.readFileSync(ENV_PATH, "utf-8");
        if (!envContent.includes("SYSTEM_USER_ID=")) {
          fs.appendFileSync(ENV_PATH, `\nSYSTEM_USER_ID=${existing._id}\n`, "utf-8");
          console.log("📄 SYSTEM_USER_ID добавлен в существующий .env");
        }
      }
    } catch (err) {
      console.warn("⚠️ Не удалось обновить .env:", err.message);
    }

    return;
  }

  // 2. Создание нового системного пользователя
  const rawPassword = "system_secret_" + Date.now();
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const systemUser = await User.create({
    name: "Система",
    email: SYSTEM_EMAIL,
    password: hashedPassword,
    isVerified: true,
  });

  console.log("✅ Создан системный пользователь:", systemUser._id);
  console.log("🔐 Пароль (отладка):", rawPassword);

  // 3. Добавляем SYSTEM_USER_ID в .env
  try {
    if (!fs.existsSync(ENV_PATH)) {
      fs.writeFileSync(ENV_PATH, `SYSTEM_USER_ID=${systemUser._id}\n`, "utf-8");
      console.log("📄 .env создан с SYSTEM_USER_ID");
    } else {
      const envContent = fs.readFileSync(ENV_PATH, "utf-8");
      if (!envContent.includes("SYSTEM_USER_ID=")) {
        fs.appendFileSync(ENV_PATH, `\nSYSTEM_USER_ID=${systemUser._id}\n`, "utf-8");
        console.log("📄 SYSTEM_USER_ID добавлен в существующий .env");
      }
    }
  } catch (err) {
    console.warn("⚠️ Не удалось обновить .env:", err.message);
  }
}
