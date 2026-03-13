import express from 'express';
import jwt from 'jsonwebtoken';
import Board from '../models/Board.js';
import mongoose from 'mongoose';
import { io } from '../server.js';
import Task from '../models/Task.js';

const router = express.Router();

const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

router.use(authMiddleware);

// Получить все доски (владелец ИЛИ участник)
router.get('/', async (req: any, res) => {
  try {
    const boards = await Board.find({
      $or: [
        { user: req.userId },
        { members: req.userId }
      ]
    })
      .populate('user', 'username displayName avatar')           // owner
      .populate('members', 'username displayName avatar')        // все участники
      .select('name createdAt inviteCode inviteUsed members user membersCount maxMembers') // membersCount можно оставить виртуальным
      .sort({ createdAt: 1 });

    const formatted = boards.map(board => ({
      _id: board._id,
      name: board.name,
      createdAt: board.createdAt,
      inviteCode: board.inviteCode,
      inviteUsed: board.inviteUsed,
      membersCount: board.members.length,
      maxMembers: 5,
      owner: board.user,
      members: board.members,           // ← массив объектов участников
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Создать новую доску
router.post('/', async (req: any, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ message: 'Название доски обязательно' });
    }

    const count = await Board.countDocuments({ user: req.userId });
    if (count >= 3) {
      return res.status(400).json({ message: 'Максимум 3 доски' });
    }

    const generateCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();
    let inviteCode = generateCode();
    while (await Board.findOne({ inviteCode })) {
      inviteCode = generateCode();
    }

    const board = new Board({
      name,
      user: req.userId,
      members: [req.userId],   // владелец автоматически в участниках
      inviteCode,
      inviteUsed: false,
    });
    await board.save();

    res.status(201).json(board);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Присоединиться по коду
router.post('/join', async (req: any, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode?.trim()) {
    return res.status(400).json({ message: 'Код обязателен' });
  }

  try {
    const board = await Board.findOne({ inviteCode: inviteCode.trim() });

    if (!board) {
      return res.status(404).json({ message: 'Недействительный код' });
    }

    const userIdStr = req.userId.toString();

    // Уже участник этой доски
    if (board.user.toString() === userIdStr ||
      board.members.some((m: any) => m.toString() === userIdStr)) {
      return res.status(400).json({ message: 'Вы уже участник этой доски' });
    }

    // Проверка: доска уже заполнена (5 участников)
    if (board.members.length >= 5) {
      return res.status(400).json({ message: 'Доска заполнена (максимум 5 участников)' });
    }

    // 🔥 ОДИН ПОЛЬЗОВАТЕЛЬ — ОДНА ДОСКА (только для гостей)
    const alreadyGuest = await Board.findOne({
      members: new mongoose.Types.ObjectId(req.userId),
      user: { $ne: new mongoose.Types.ObjectId(req.userId) } // не владелец
    });
    if (alreadyGuest) {
      return res.status(400).json({ message: 'Вы уже являетесь участником другой доски. Один пользователь может быть гостем только в одной доске.' });
    }

    // Добавляем участника
    board.members.push(req.userId);

    // Если доска теперь заполнена — деактивируем код
    if (board.members.length >= 5) {
      board.inviteUsed = true;
    }

    await board.save();

    res.json({
      _id: board._id,
      name: board.name,
      createdAt: board.createdAt,
      inviteCode: board.inviteCode,
      inviteUsed: board.inviteUsed,
      membersCount: board.members.length,           // ← добавили
      maxMembers: 5
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// === ВЫХОД ИЗ ДОСКИ (для гостей) ===
router.delete('/:boardId/leave', async (req: any, res) => {
  try {
    const board = await Board.findById(req.params.boardId);
    if (!board) return res.status(404).json({ message: 'Доска не найдена' });

    const userIdStr = req.userId.toString();

    // Владелец не может "выйти" — только удалить доску
    if (board.user.toString() === userIdStr) {
      return res.status(400).json({ message: 'Вы владелец. Чтобы удалить доску, используйте кнопку "Удалить доску"' });
    }

    // Убираем пользователя из участников
    board.members = board.members.filter((m: any) => m.toString() !== userIdStr);

    // Если доска стала пустой — сбрасываем inviteUsed (на всякий случай)
    if (board.members.length === 1) { // остался только владелец
      board.inviteUsed = false;
    }

    await board.save();

    // Уведомляем всех в комнате через Socket.IO
    io.to(`board:${board._id}`).emit('userLeftBoard', {
      boardId: board._id,
      userId: req.userId,
      membersCount: board.members.length
    });

    res.json({ message: 'Вы успешно вышли из доски' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// === УДАЛЕНИЕ СВОЕЙ ДОСКИ (только владелец) ===
router.delete('/:boardId', async (req: any, res) => {
  try {
    const board = await Board.findById(req.params.boardId);
    if (!board) return res.status(404).json({ message: 'Доска не найдена' });

    if (board.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Удалить доску может только владелец' });
    }

    // Удаляем все задачи этой доски
    await Task.deleteMany({ board: board._id });

    // Удаляем саму доску
    await Board.findByIdAndDelete(board._id);

    // Уведомляем всех (кто был в комнате)
    io.to(`board:${board._id}`).emit('boardDeleted', board._id);

    res.json({ message: 'Доска и все задачи успешно удалены' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

export default router;