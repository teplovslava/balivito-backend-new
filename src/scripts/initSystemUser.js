import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import User from "../models/User.js";

dotenv.config();

export async function ensureSystemUser() {
  const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID;

  console.log(SYSTEM_USER_ID, SYSTEM_USER_ID?.length)

  if (SYSTEM_USER_ID && SYSTEM_USER_ID?.length === 24) {
    const exists = await User.findById(SYSTEM_USER_ID);
    if (exists) {
      console.log("✅ Системный пользователь уже существует:", exists._id);
      return;
    }
  }

  const rawPassword = "system_secret_" + Date.now();
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const systemUser = await User.create({
    name: "Система",
    email: 'balivito@gmail.com',
    password: hashedPassword,
    isVerified: true,
  });

  const newId = systemUser._id.toString();
  console.log("✅ Создан системный пользователь:", newId);
  console.log("🔐 Пароль (только для отладки):", rawPassword);

  const envPath = path.resolve(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, "utf-8");

  const updated = envContent.includes("SYSTEM_USER_ID=")
    ? envContent.replace(/SYSTEM_USER_ID=.*/g, `SYSTEM_USER_ID=${newId}`)
    : envContent + `\nSYSTEM_USER_ID=${newId}`;

  fs.writeFileSync(envPath, updated, "utf-8");

  console.log("📦 .env обновлён: SYSTEM_USER_ID=" + newId);
}
