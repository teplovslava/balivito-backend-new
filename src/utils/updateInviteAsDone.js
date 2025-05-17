// utils/updateInviteAsDone.js
import { getIo } from '../utils/ioHolder.js';
import Message   from '../models/Message.js';

export async function updateInviteAsDone({
  chat,                 // экземпляр Chat
  filter,               // объект-предикат для Message.findOne(...)
  newText,              // итоговый текст
}) {
  const msg = await Message.findOne({ chatId: chat._id, ...filter });
  if (!msg) return;

  msg.text   = newText;
  msg.action = null;
  await msg.save();

  chat.lastMessage = { text: newText, date: new Date() };
  await chat.save();

  /* уведомляем только участников чата */
  getIo().to(chat._id.toString()).emit('message_updated', {
    chatId   : chat._id,
    messageId: msg._id,
    text     : newText,
    mediaUrl : msg.mediaUrl,
    action   : null,
  });
}
