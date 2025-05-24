import dotenv from "dotenv";
import http from "http"; // нужен обертка-сервер для сокетов
import { Server } from "socket.io"; // добавляем импорт
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { socketAuth } from "./middlewares/socketAuth.js";
import { socket as handleSocketConnection } from "./socket.js";
import agenda from "./agenda/agendaInstance.js";
import defineReviewReminder from "./agenda/reviewReminder.js";

import { ensureSystemUser } from "./scripts/initSystemUser.js";
import { setIo } from "./utils/ioHolder.js";
import { runSeed } from "./scripts/user.js";

dotenv.config();

const PORT = process.env.PORT || 7777;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["polling", "websocket"],
});

setIo(io);

connectDB().then(async () => {
  await agenda.start(); // запуск Agenda
  defineReviewReminder(agenda); // регистрация задач

  // await ensureSystemUser();

  await ensureDefaultCategories();
  await ensureDefaultLocations();

  await runSeed();

  server.listen(PORT, () =>
    console.log(`🚀 Server started on port ${PORT}`)
  );
});

io.use(socketAuth);
io.on("connection", (socket) => handleSocketConnection(socket, io));
