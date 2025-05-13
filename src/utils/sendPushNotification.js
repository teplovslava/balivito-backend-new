import axios from "axios";

export const sendPushNotification = async (
  expoPushToken,
  message,
  title = "Уведомление",
  data = {}
) => {
  try {
    await axios.post("https://exp.host/--/api/v2/push/send", {
      to: expoPushToken,
      sound: "default",
      title,
      body: message,
      data,
    });
  } catch (err) {
    console.error(
      "Push notification error:",
      err.response?.data || err.message
    );
  }
};
