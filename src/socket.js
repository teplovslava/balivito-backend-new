import {
  connectUser,
  deleteMessage,
  editMessage,
  getMessages,
  getUserChats,
  readChat,
  sendMessage,
  setReaction,
  typeMessage,
} from "./controllers/chat.js";

export const socket = async (ioSocket, io) => {
  console.log("Пользователь подключился:", ioSocket.id);

  await connectUser(ioSocket);

  ioSocket.on("get_user_chats", (data, cb) => getUserChats(ioSocket, data, cb));
  ioSocket.on("get_messages", (data, cb) => getMessages(ioSocket, data, cb));
  ioSocket.on("send_message", (data, cb) =>
    sendMessage(ioSocket, io, data, cb)
  );
  ioSocket.on("read_chat", (data) => readChat(ioSocket, io, data));
  ioSocket.on("set_reaction", (data, cb) =>
    setReaction(ioSocket, io, data, cb)
  );
  ioSocket.on("delete_message", (data) => deleteMessage(ioSocket, io, data));
  ioSocket.on("change_message", (data) => editMessage(ioSocket, io, data));
  ioSocket.on("type_message", (data) => typeMessage(ioSocket, io, data));

  ioSocket.on("disconnect", () => {
    console.log("Пользователь отключился:", ioSocket.id);
  });
};
