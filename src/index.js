import app from './app.js';
import { connectDB } from './config/db.js';
import dotenv from 'dotenv';
import { runSeed } from './scripts/user.js';
import { Server } from 'socket.io';  // добавляем импорт
import http from 'http'; // нужен обертка-сервер для сокетов
import { socketAuth } from './middlewares/socketAuth.js';
import { socket as handleSocketConnection} from './socket.js';

dotenv.config();

const PORT = process.env.PORT || 7777;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['polling','websocket']
});

connectDB().then(() => {
  server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
});

io.use(socketAuth)
io.on('connection', (socket) => handleSocketConnection(socket, io));
