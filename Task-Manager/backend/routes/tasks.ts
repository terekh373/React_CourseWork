import express from 'express';
import jwt from 'jsonwebtoken';
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

// GET /api/tasks — активные задачи (только по board, без фильтра по user)
router.get('/', async (req: any, res) => {
  const boardId = req.query.board as string | undefined;
  const query: any = { isArchived: false };
  if (boardId) query.board = boardId;

  try {
    const tasks = await Task.find(query)
      .populate('createdBy', 'displayName avatar username')  // ← добавили
      .sort({ order: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// GET /api/tasks/archive
router.get('/archive', async (req: any, res) => {
  const boardId = req.query.board as string | undefined;

  const query: any = { isArchived: true };
  if (boardId) query.board = boardId;

  try {
    const tasks = await Task.find(query)
      .populate('createdBy', 'displayName avatar username')
      .sort({ archivedAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// POST — создание задачи
router.post('/', async (req: any, res) => {
  if (!req.body.board) return res.status(400).json({ message: 'board required' });

  try {
    const task = new Task({
      ...req.body,
      user: req.userId,           // можно оставить как "владелец задачи" или убрать
      createdBy: req.userId,      // ← новое поле — кто именно создал
      board: req.body.board,
    });
    await task.save();

    // Важно: populate перед отправкой, чтобы фронт сразу получил имя и аватар
    const populatedTask = await Task.findById(task._id)
      .populate('createdBy', 'displayName avatar username');

    io.to(`board:${req.body.board}`).emit('taskCreated', populatedTask);
    res.status(201).json(populatedTask);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT — обновление (drag-and-drop, статус и т.д.)
router.put('/:id', async (req: any, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id },
      req.body,
      { new: true }
    ).populate('createdBy', 'displayName avatar username');
    if (!task) return res.status(404).json({ message: 'Task not found' });

    io.to(`board:${task.board}`).emit('taskUpdated', task);
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// DELETE — в архив
router.delete('/:id', async (req: any, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id },           // 🔥 убрали user
      { isArchived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!task) return res.status(404).json({ message: 'Task not found' });

    io.to(`board:${task.board}`).emit('taskArchived', task._id);
    res.json({ message: 'Task moved to archive' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// RESTORE
router.post('/:id/restore', async (req: any, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id },
      { isArchived: false, archivedAt: null },
      { new: true }
    ).populate('createdBy', 'displayName avatar username');
    if (!task) return res.status(404).json({ message: 'Task not found' });

    io.to(`board:${task.board}`).emit('taskRestored', task);
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// PERMANENT DELETE
router.delete('/:id/permanent', async (req: any, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    await Task.findOneAndDelete({ _id: req.params.id });

    io.to(`board:${task.board}`).emit('taskDeleted', req.params.id);
    res.json({ message: 'Task permanently deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

export default router;