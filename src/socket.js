import {
    connectUser,
    getMessages,
    getUserChats,
    readChat,
    sendMessage
  } from "./controllers/chat.js";
  
  export const socket = async (ioSocket, io) => {
    console.log('Пользователь подключился:', ioSocket.id);
  
    await connectUser(ioSocket);
  
    ioSocket.on('get_user_chats', (data, cb) => getUserChats(ioSocket, data, cb));
    ioSocket.on('get_messages', (data, cb) => getMessages(ioSocket, data, cb));
    ioSocket.on('send_message', (data, cb) => sendMessage(ioSocket, io, data, cb));
    ioSocket.on('read_chat', (data) => readChat(ioSocket, data));
  
    ioSocket.on('disconnect', () => {
        console.log('Пользователь отключился:', ioSocket.id);
    });
  };
  