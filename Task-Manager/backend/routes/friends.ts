import express from 'express';
import jwt from 'jsonwebtoken';
import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';

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

// Получить все списки
router.get('/', async (req: any, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).populate('friends', 'username displayName avatar');

    const incoming = await FriendRequest.find({ to: userId, status: 'pending' })
      .populate('from', 'username displayName avatar');

    const outgoing = await FriendRequest.find({ from: userId, status: 'pending' })
      .populate('to', 'username displayName avatar');

    res.json({
      friends: user?.friends || [],
      incoming: incoming.map(r => ({ ...r.toObject(), requestId: r._id })),
      outgoing: outgoing.map(r => ({ ...r.toObject(), requestId: r._id })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Отправить запрос по логину
router.post('/request', async (req: any, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ message: 'Укажите логин' });

  try {
    const toUser = await User.findOne({ username });
    if (!toUser) return res.status(404).json({ message: 'Пользователь не найден' });

    const fromId = req.userId;
    if (toUser._id.toString() === fromId) return res.status(400).json({ message: 'Нельзя добавить себя' });

    const currentUser = await User.findById(fromId);
    if (currentUser?.friends.includes(toUser._id)) return res.status(400).json({ message: 'Уже в друзьях' });

    const existing = await FriendRequest.findOne({
      $or: [{ from: fromId, to: toUser._id }, { from: toUser._id, to: fromId }],
      status: 'pending'
    });
    if (existing) return res.status(400).json({ message: 'Запрос уже существует' });

    const request = new FriendRequest({ from: fromId, to: toUser._id });
    await request.save();

    res.json({ message: 'Запрос отправлен!' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Принять запрос
router.put('/:id/accept', async (req: any, res) => {
  try {
    const request = await FriendRequest.findById(req.params.id);
    if (!request || request.to.toString() !== req.userId) return res.status(404).json({ message: 'Запрос не найден' });

    request.status = 'accepted';
    await request.save();

    await User.findByIdAndUpdate(request.from, { $addToSet: { friends: request.to } });
    await User.findByIdAndUpdate(request.to, { $addToSet: { friends: request.from } });

    res.json({ message: 'Запрос принят' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Отклонить / отменить
router.put('/:id/reject', async (req: any, res) => {
  try {
    const request = await FriendRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Запрос не найден' });

    if (request.to.toString() !== req.userId && request.from.toString() !== req.userId) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    await FriendRequest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Запрос удалён' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Удалить из друзей
router.delete('/:userId/remove', async (req: any, res) => {
  try {
    const myId = req.userId;
    const friendId = req.params.userId;

    await User.findByIdAndUpdate(myId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: myId } });

    res.json({ message: 'Друга видалено' });
  } catch (err) {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

export default router;