import Chat from "../models/Chat.js";
import { getSystemUserId } from "./getSystemUserId.js";

export async function getSystemChatForUser(userId) {
  const SYSTEM_USER_ID = getSystemUserId();

  let chat = await Chat.findOne({
    participants: { $all: [SYSTEM_USER_ID, userId], $size: 2 },
  });

  let wasCreated = false;
  if (!chat) {
    chat = await Chat.create({
      isSystemChat: true,
      participants: [SYSTEM_USER_ID, userId],
      unreadCounts: { [userId.toString()]: 0 },
    });
    wasCreated = true;
  }
  return { chat, wasCreated };
}

