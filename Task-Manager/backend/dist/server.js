import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import boardsRouter from './routes/boards.js';
import friendsRoutes from './routes/friends.js';
import path from 'path';
dotenv.config();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: 'http://localhost:3000', // порт твоего фронтенда
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
const onlineUsersByBoard = {};
app.use(express.json());
app.use(cors());
// Статика для аватарок
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));
// Роуты
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/boards', boardsRouter);
app.use('/api/friends', friendsRoutes);
// Socket.IO: авторизация по JWT
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token)
        return next(new Error('Authentication error'));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = decoded.userId;
        next();
    }
    catch (err) {
        next(new Error('Invalid token'));
    }
});
// Подключение клиента
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    // Клиент сообщает, к какой доске он присоединился
    socket.on('joinBoard', (boardId) => {
        if (typeof boardId !== 'string' || !boardId.trim()) {
            console.log('Invalid boardId received');
            return;
        }
        const room = `board:${boardId}`;
        socket.join(room);
        if (!onlineUsersByBoard[boardId]) {
            onlineUsersByBoard[boardId] = new Set();
        }
        const wasAdded = onlineUsersByBoard[boardId].add(socket.data.userId).size > 0;
        if (wasAdded) {
            // Отправляем ВСЕМ в комнате (включая новичка) актуальный список
            io.to(room).emit('onlineUsers', Array.from(onlineUsersByBoard[boardId]));
            console.log(`User ${socket.data.userId} joined ${boardId}. Online now: ${onlineUsersByBoard[boardId].size}`);
        }
    });
    socket.on('leaveBoard', (boardId) => {
        if (!boardId)
            return;
        socket.leave(`board:${boardId}`);
        if (onlineUsersByBoard[boardId]) {
            onlineUsersByBoard[boardId].delete(socket.data.userId);
            io.to(`board:${boardId}`).emit('onlineUsers', Array.from(onlineUsersByBoard[boardId]));
        }
    });
    // При отключении — убираем из всех досок, где был
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.data.userId}`);
        // Находим все доски, где этот пользователь был онлайн
        Object.entries(onlineUsersByBoard).forEach(([boardId, users]) => {
            if (users.has(socket.data.userId)) {
                users.delete(socket.data.userId);
                // Если доска опустела — можно удалить, но необязательно
                if (users.size === 0) {
                    delete onlineUsersByBoard[boardId];
                }
                else {
                    // Обновляем онлайн для оставшихся
                    io.to(`board:${boardId}`).emit('onlineUsers', Array.from(users));
                }
            }
        });
    });
});
// Экспортируем io, чтобы использовать в роутах tasks
export { io };
const PORT = process.env.PORT || 5000;
httpServer.listen(Number(PORT), '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
