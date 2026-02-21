import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Реєстрація
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Користувач з таким логіном вже існує' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'Користувача зареєстровано' });
  } catch (err) {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// Логін
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Неправильний логін або пароль' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// Middleware для авторизації (потрібно для нових ендпоінтів)
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Токен відсутній' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Недійсний токен' });
  }
};

// Отримати інформацію про користувача
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });
    res.json({ username: user.username });
  } catch (err) {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// Зміна логіну (username)
router.put('/change-username', authMiddleware, async (req: any, res) => {
  const { newUsername } = req.body;

  if (!newUsername || newUsername.length < 3) {
    return res.status(400).json({ message: 'Новий логін повинен бути не коротшим 3 символів' });
  }

  try {
    const existing = await User.findOne({ username: newUsername });
    if (existing && existing._id.toString() !== req.userId) {
      return res.status(400).json({ message: 'Такий логін вже зайнятий' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { username: newUsername },
      { new: true }
    ).select('-password');

    res.json({ message: 'Логін успішно змінено', username: user?.username });
  } catch (err) {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// Зміна пароля
router.put('/change-password', authMiddleware, async (req: any, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'Заповніть всі поля' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Нові паролі не співпадають' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Новий пароль повинен бути не коротшим 6 символів' });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Старий пароль неправильний' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: 'Пароль успішно змінено' });
  } catch (err) {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

export default router;