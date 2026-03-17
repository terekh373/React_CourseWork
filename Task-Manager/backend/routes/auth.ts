import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import multer from 'multer';  // Для загрузки файлов
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Настройка Multer: храним в /uploads, генерируем уникальное имя
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Регистрация: добавляем displayName
router.post('/register', async (req, res) => {
  const { username, displayName, password, securityQuestion, securityAnswer } = req.body;

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  if (/\s/.test(username)) {
    return res.status(400).json({ message: 'Логін не може містити пробіли' });
  }

  if (!displayName || displayName.length < 3) {
    return res.status(400).json({ message: 'Ник должен быть не короче 3 символов' });
  }
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Пользователь с таким логином уже существует' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      displayName,
      password: hashedPassword,
      securityQuestion: securityQuestion?.trim() || '',
      securityAnswer: securityAnswer?.trim() || '',
    });
    await user.save();
    res.status(201).json({ message: 'Пользователь зарегистрирован' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Логин (без изменений)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Неправильный логин или пароль' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Middleware авторизации (без изменений)
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Токен отсутствует' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Недействительный токен' });
  }
};

// Получить информацию о пользователе: добавляем displayName и avatar
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('_id username displayName avatar');   // ← добавили _id
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    res.json(user);   // теперь будет { _id, username, displayName, avatar }
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Изменить ник (displayName)
router.put('/change-displayname', authMiddleware, async (req: any, res) => {
  const { newDisplayName } = req.body;

  if (!newDisplayName || newDisplayName.length < 3) {
    return res.status(400).json({ message: 'Новый ник должен быть не короче 3 символов' });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { displayName: newDisplayName },
      { new: true }
    ).select('-password');

    res.json({ message: 'Ник успешно изменен', displayName: user?.displayName });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Загрузка аватарки
router.post('/upload-avatar', authMiddleware, upload.single('avatar'), async (req: any, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Файл не загружен' });
  }
  const avatarUrl = `/uploads/${req.file.filename}`;  // URL для сервировки
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');
    res.json({ message: 'Аватарка обновлена', avatar: user?.avatar });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Зміна логіну (username)
router.put('/change-username', authMiddleware, async (req: any, res) => {
  const { newUsername } = req.body;

  if (!newUsername || newUsername.length < 3) {
    return res.status(400).json({ message: 'Новий логін повинен бути не коротшим 3 символів' });
  }

  if (/\s/.test(newUsername)) {
    return res.status(400).json({ message: 'Логін не може містити пробіли' });
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

// 1. Получить вопрос по username (для фронта)
router.post('/forgot-password/question', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ message: 'Введите логин' });

  const user = await User.findOne({ username });
  if (!user || !user.securityQuestion) {
    return res.status(404).json({ message: 'Пользователь не найден или вопрос не задан' });
  }

  res.json({ question: user.securityQuestion });
});

const validatePassword = (pwd: string): string | null => {
  if (pwd.length < 8) return 'Пароль должен быть минимум 8 символов';
  if (!/[A-Z]/.test(pwd)) return 'Должна быть хотя бы одна заглавная буква';
  if (!/[a-z]/.test(pwd)) return 'Должна быть хотя бы одна строчная буква';
  if (!/[0-9]/.test(pwd)) return 'Должна быть хотя бы одна цифра';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd)) {
    return 'Должен быть хотя бы один специальный символ';
  }
  return null;
};

// 2. Проверить ответ и сбросить пароль
router.post('/forgot-password/reset', async (req, res) => {
  const { username, answer, newPassword } = req.body;

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  if (!username || !answer || !newPassword) {
    return res.status(400).json({ message: 'Все поля обязательны' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Пароль слишком короткий' });
  }

  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

  // Простое сравнение (можно сделать trim().toLowerCase() для большей лояльности)
  if (user.securityAnswer.trim().toLowerCase() !== answer.trim().toLowerCase()) {
    return res.status(400).json({ message: 'Неверный ответ' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  user.password = hashed;
  await user.save();

  res.json({ message: 'Пароль успешно изменён' });
});

router.post('/verify-security-answer', async (req: any, res) => {
  const { username, answer } = req.body;
 
  if (!username || !answer) {
    return res.status(400).json({ message: 'Заповніть всі поля' });
  }
 
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }
 
    if (!user.securityAnswer) {
      return res.status(400).json({ message: 'Секретне питання не встановлено' });
    }
 
    if (user.securityAnswer.trim().toLowerCase() !== answer.trim().toLowerCase()) {
      return res.status(400).json({ message: 'Невірна відповідь на секретне питання' });
    }
 
    res.json({ message: 'OK' });
  } catch (err) {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

export default router;
