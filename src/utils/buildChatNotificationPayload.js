// utils/buildChatNotificationPayload.js
export const buildChatPayload = ({
  chatId,
  ad   = null,
  companionId,
  companionName,
  isSystemChat = false,
}) => ({
  chatId,
  adId:    ad?._id  ?? null,
  adPhoto: ad?.photos?.[0] ?? '',
  adName:  ad?.title ?? '',
  companionId,
  companionName,
  isSystemChat,
});
