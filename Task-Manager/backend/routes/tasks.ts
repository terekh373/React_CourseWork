import express from 'express';
import jwt from 'jsonwebtoken';
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

router.get('/', async (req: any, res) => {
  const tasks = await Task.find({ user: req.userId });
  res.json(tasks);
});

router.post('/', async (req: any, res) => {
  const task = new Task({ ...req.body, user: req.userId });
  await task.save();
  res.status(201).json(task);
});

router.put('/:id', async (req: any, res) => {
  const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.userId }, req.body, { new: true });
  if (!task) return res.status(404).json({ message: 'Task not found' });
  res.json(task);
});

router.delete('/:id', async (req: any, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!task) return res.status(404).json({ message: 'Task not found' });
  res.json({ message: 'Task deleted' });
});

export default router;