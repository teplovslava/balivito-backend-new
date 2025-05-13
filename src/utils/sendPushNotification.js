import axios from "axios";

export const sendPushNotification = async (expoPushToken, message, title) => {
  try {
    await axios.post("https://exp.host/--/api/v2/push/send", {
      to: expoPushToken,
      sound: "default",
      title: title,
      body: message,
      data: { withSome: "data" },
    });
  } catch (err) {
    console.error(
      "Push notification error:",
      err.response?.data || err.message
    );
  }
};
