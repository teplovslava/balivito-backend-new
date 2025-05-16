import Chat from "../models/Chat.js";

export const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID;

export async function getSystemChatForUser(userId) {
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