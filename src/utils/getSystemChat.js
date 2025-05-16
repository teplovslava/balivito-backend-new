import Chat from "../models/Chat.js";
import { getSystemUserId } from "./getSystemUserId.js";

export async function getSystemChatForUser(userId) {
  const SYSTEM_USER_ID = getSystemUserId();

  console.log("SYSTEM_USER_ID = ", SYSTEM_USER_ID, "| userId = ", userId);

  if (!SYSTEM_USER_ID) {
    throw new Error("❌ SYSTEM_USER_ID is undefined — check .env or dotenv timing");
  }

  const chat = await Chat.findOne({
    participants: { $all: [SYSTEM_USER_ID, userId], $size: 2 },
  });

  if (chat) return chat;

  return Chat.create({
    isSystemChat: true,
    participants: [SYSTEM_USER_ID, userId],
    unreadCounts: { [userId.toString()]: 0 },
  });
}
