import { Schema, model } from "mongoose";

const messageSchema = new Schema(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      default: "",
    },
    mediaUrl: {
      type: [String], // ссылка на изображение
      default: "",
    },
    mediaType: {
      type: String, // например, 'image', 'video' (пока можно ограничиться 'image')
      default: "",
    },
    isRead: { type: Boolean, default: false },
    reaction: {
      type: String,
      default: null,
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    isChanged: {
      type: Boolean,
      default: false,
    },
    action: {
      type: {
        type: String,
      },
      label: {
        type: String,
      },
      meta: {
        type: Schema.Types.Mixed,
      },
    },
  },
  {
    timestamps: true,
  }
);

export default model("Message", messageSchema);
