// utils/sendSystemInvite.js
import Message                 from '../models/Message.js';
import User                    from '../models/User.js';
import { getIo }               from '../utils/ioHolder.js';
import { sendPushNotification } from '../utils/sendPushNotification.js';
import { buildChatPayload      } from '../utils/buildChatNotificationPayload.js';
import { getSystemUserId       } from '../utils/getSystemUserId.js';

export async function sendSystemInvite({
  chat,
  targetId,         // кому отправляем
  text,
  action = null,    // { type, label, meta } | null
}) {
  const SYSTEM_USER_ID = getSystemUserId();
  const SYSTEM_NAME    = 'BALIVITO';

  /* 1. создаём сообщение-инвайт */
  const msg = await Message.create({
    chatId  : chat._id,
    sender  : SYSTEM_USER_ID,
    text,
    mediaUrl: [],
    action,                 // может быть null
  });

  /* 2. lastMessage / unreadCounts */
  chat.lastMessage = { text, date: msg.createdAt };
  chat.unreadCounts.set(
    targetId.toString(),
    (chat.unreadCounts.get(targetId.toString()) || 0) + 1,
  );
  await chat.save();

  /* 3. sockets */
  const io = getIo();
  if (io) {
    io.in(`user:${targetId}`).socketsJoin(chat._id.toString());

    io.to(chat._id.toString()).emit('new_message', {
      chatId   : chat._id,
      messageId: msg._id,
      sender   : { _id: SYSTEM_USER_ID, name: SYSTEM_NAME },
      text,
      mediaUrl : [],
      createdAt: msg.createdAt,
      isRead   : false,
      isChanged: false,
      action,
    });
  }

  /* 4. push */
  const pushToken = await User.findById(targetId).then((u) => u?.expoPushToken);
  if (pushToken) {
    await sendPushNotification(
      pushToken,
      text,
      'Системное сообщение',
      buildChatPayload({
        chatId       : chat._id,
        companionId  : SYSTEM_USER_ID,
        companionName: SYSTEM_NAME,
        isSystemChat : true,
      }),
    );
  }
}
