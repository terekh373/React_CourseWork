import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable, DropResult, DroppableProps } from 'react-beautiful-dnd';
import {
  Container, Row, Col, Card, Button, Modal, Form, Badge,
  InputGroup, FormControl, Alert, Image, CloseButton
} from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faSearch, faClock, faSun, faMoon,
  faExclamationTriangle, faCheckCircle, faUser, faChartBar, faUserPlus
} from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import { Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { io, Socket } from 'socket.io-client';
import { toast } from 'react-toastify';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

export const StrictModeDroppable = ({ children, ...props }: DroppableProps) => {
  const [enabled, setEnabled] = useState(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // Откладываем регистрацию Droppable на следующий кадр
    animationRef.current = requestAnimationFrame(() => setEnabled(true));

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      setEnabled(false);
    };
  }, []);

  if (!enabled) {
    return null; // ничего не рендерим в первом монтировании Strict Mode
  }

  return <Droppable {...props}>{children}</Droppable>;
};

interface Label {
  name: string;
  color: string;
}

interface JwtPayload {
  userId: string;
  // exp, iat и т.д. если нужно
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  deadline?: string;
  order?: number;
  createdAt?: string;
  labels?: Label[];
  tags?: string[];
  isArchived?: boolean;
  archivedAt?: string | null;
  createdBy?: UserInfo;
}

interface TaskListProps {
  token: string;
}

interface Board {
  _id: string;
  name: string;
  createdAt: string;
  inviteCode?: string;
  inviteUsed?: boolean;
  membersCount: number;      // ← новое
  maxMembers: number;        // ← новое, всегда 5
  owner?: UserInfo;
  members: UserInfo[];
}

interface UserInfo {
  _id: string;
  displayName: string;
  avatar: string;
  username: string;
}

interface Friend {
  _id: string;
  username: string;
  displayName: string;
  avatar: string;
}

interface FriendRequestItem {
  requestId: string;
  from?: Friend;
  to?: Friend;
}

const columns = ['To Do', 'In Progress', 'Done'] as const;

type SortOption =
  | 'default'
  | 'title-asc'
  | 'title-desc'
  | 'priority-high'
  | 'priority-low'
  | 'deadline-asc'
  | 'deadline-desc'
  | 'overdue-first';

// Доступные метки (можно расширить)
const AVAILABLE_LABELS: Label[] = [
  { name: 'Bug', color: '#dc3545' },
  { name: 'Feature', color: '#198754' },
  { name: 'Design', color: '#0d6efd' },
  { name: 'Urgent', color: '#fd7e14' },
  { name: 'Blocked', color: '#6c757d' },
  { name: 'Review', color: '#6610f2' },
  { name: 'Docs', color: '#17a2b8' },
];

const TaskList: React.FC<TaskListProps> = ({ token }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [deadline, setDeadline] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<'To Do' | 'In Progress' | 'Done'>('To Do');

  const [socket, setSocket] = useState<Socket | null>(null);

  // Метки и теги
  const [selectedLabels, setSelectedLabels] = useState<Label[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState('');

  // Профиль
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [currentDisplayName, setCurrentDisplayName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [avatar, setAvatar] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [boards, setBoards] = useState<any[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  // в начале компонента TaskList, рядом с другими useState
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);


  const [taskFilter, setTaskFilter] = useState<'all' | 'mine'>('all');

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const [userId, setUserId] = useState<string | null>(null);

  const [friendUsernameInput, setFriendUsernameInput] = useState<string>('');

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const [showStatsModal, setShowStatsModal] = useState(false);
  const [stats, setStats] = useState<any>({
    total: 0,
    active: 0,
    done: 0,
    overdue: 0,
    archived: 0,
    byStatus: { 'To Do': 0, 'In Progress': 0, 'Done': 0 },
    byPriority: { Low: 0, Medium: 0, High: 0 },
    byLabel: {},
    byTag: {},
    recentOverdue: [],
  });

  // Сортировка
  const [sortOptions, setSortOptions] = useState<Record<string, SortOption>>({
    'To Do': 'default',
    'In Progress': 'default',
    'Done': 'default',
  });
  // Расширенный поиск
  const [searchQuery, setSearchQuery] = useState('');

  // Тема
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // 1. Сначала смотрим, что сохранено пользователем
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return saved === 'true';
    }

    // 2. Если ничего не сохранено — берём системную настройку
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsData, setFriendsData] = useState({
    friends: [] as Friend[],
    incoming: [] as FriendRequestItem[],
    outgoing: [] as FriendRequestItem[],
  });
  const [activeFriendsTab, setActiveFriendsTab] = useState<'friends' | 'incoming' | 'outgoing'>('friends');

  useEffect(() => {
    // Сохраняем в localStorage при каждом изменении
    localStorage.setItem('darkMode', darkMode.toString());

    // Можно также менять класс на <html> или <body> для глобального применения
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const newSocket = io('http://localhost:5000', {
      auth: {
        token: token,
      },
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
    });

    newSocket.on('onlineUsers', (userIds: string[]) => {
      setOnlineUsers(new Set(userIds));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!socket || !activeBoardId) return;

    // Присоединяемся к комнате доски
    socket.emit('joinBoard', activeBoardId);

    // Слушаем создание задачи
    socket.on('taskCreated', (newTask: Task) => {
      setTasks(prev => [...prev, newTask]);
    });

    // Обновление задачи
    socket.on('taskUpdated', (updatedTask: Task) => {
      setTasks(prev =>
        prev.map(t => (t._id === updatedTask._id ? updatedTask : t))
      );
    });

    // Архивирование
    socket.on('taskArchived', (taskId: string) => {
      setTasks(prev => prev.filter(t => t._id !== taskId));
    });

    // Восстановление
    socket.on('taskRestored', (restoredTask: Task) => {
      setTasks(prev => [...prev, restoredTask]);
    });

    // Перманентное удаление
    socket.on('taskDeleted', (taskId: string) => {
      setTasks(prev => prev.filter(t => t._id !== taskId));
    });

    return () => {
      socket.off('taskCreated');
      socket.off('taskUpdated');
      socket.off('taskArchived');
      socket.off('taskRestored');
      socket.off('taskDeleted');
      socket.emit('leaveBoard', activeBoardId);
    };
  }, [socket, activeBoardId]);

  useEffect(() => {
    const loadBoards = async () => {
      try {
        const res = await axios.get<Board[]>('http://localhost:5000/api/boards', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const loadedBoards = res.data;
        setBoards(loadedBoards);

        // Восстанавливаем последнюю выбранную доску из localStorage
        const savedBoardId = localStorage.getItem('lastBoardId');
        const validBoard = loadedBoards.find((b: Board) => b._id === savedBoardId);

        if (validBoard) {
          setActiveBoardId(validBoard._id);
        } else if (loadedBoards.length > 0) {
          setActiveBoardId(loadedBoards[0]._id);
        }
      } catch (err) {
        console.error('Ошибка загрузки досок:', err);
      }
    };
    loadBoards();
  }, [token]);


  // Парсим фильтры один раз при изменении searchQuery
  const parsedFilters = useMemo(() => {
    const filters: any = {
      text: '',
      status: null,
      priority: null,
      deadline: null,      // { operator: '>', value: Date }
      label: null,
      tag: null,
    };

    let query = searchQuery.trim().toLowerCase();
    if (!query) return filters;

    // Разбиваем на токены
    const tokens = query.split(/\s+/);

    const newTextParts: string[] = [];

    tokens.forEach(token => {
      if (token.includes(':')) {
        const [key, value] = token.split(':');
        if (!value) return;

        switch (key) {
          case 'status':
            if (['todo', 'inprogress', 'done'].includes(value)) {
              filters.status = value;
            }
            break;
          case 'priority':
            if (['low', 'medium', 'high'].includes(value)) {
              filters.priority = value.charAt(0).toUpperCase() + value.slice(1);
            }
            break;
          case 'label':
            filters.label = value;
            break;
          case 'deadline':
            // Поддержка >2025-01-01, <2025-12-31, 2025-06 (месяц)
            const opMatch = value.match(/^([><]?)(.+)$/);
            if (opMatch) {
              const [, op, val] = opMatch;
              try {
                let dateVal: Date | null = null;
                if (val.includes('-')) {
                  dateVal = new Date(val);
                } else if (/^\d{4}-\d{2}$/.test(val)) {
                  dateVal = new Date(val + '-01');
                }
                if (!isNaN(dateVal?.getTime() ?? NaN)) {
                  filters.deadline = { operator: op || '=', value: dateVal };
                }
              } catch { }
            }
            break;
          default:
            newTextParts.push(token);
        }
      } else if (token.startsWith('#')) {
        const tag = token.slice(1).trim();
        if (tag) filters.tag = tag;
      } else {
        newTextParts.push(token);
      }
    });

    filters.text = newTextParts.join(' ').trim();

    return filters;
  }, [searchQuery]);


  // Загружаем задачи ТОЛЬКО при смене доски
  useEffect(() => {
    if (!activeBoardId) return;
    fetchTasks();           // твоя функция без параметров
  }, [activeBoardId, token]);

  // А при смене фильтра — просто заставляем перерендерить
  useEffect(() => {
    // Пустой эффект — только для того, чтобы React заметил изменение
  }, [taskFilter]);

  useEffect(() => {
    if (activeBoardId) {
      // Сохраняем выбранную доску
      localStorage.setItem('lastBoardId', activeBoardId);

      const selected = boards.find(b => b._id === activeBoardId);
      if (selected) {
        setInviteCode(selected.inviteCode || null);
      } else {
        setInviteCode(null);
      }
    } else {
      localStorage.removeItem('lastBoardId');
      setInviteCode(null);
    }
  }, [activeBoardId, boards]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!token) {
        setLoadingUser(false);
        return;
      }
      try {
        const res = await axios.get('http://localhost:5000/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = res.data;

        setCurrentUser(user);
        setUserId(user._id);
        setCurrentUsername(user.username);
        setNewUsername(user.username);
        setCurrentDisplayName(user.displayName || user.username);
        setNewDisplayName(user.displayName || user.username);
        setAvatar(user.avatar || '');

      } catch (err) {
        console.error('Не удалось загрузить данные пользователя', err);
        toast.error("Не вдалося завантажити профіль", { theme: darkMode ? "dark" : "light" });
      } finally {
        setLoadingUser(false);
      }
    };

    fetchCurrentUser();
  }, [token]);

  useEffect(() => {
    if (activeBoardId) {
      fetchStats();
      fetchArchivedTasks();
    } else {
      setArchivedTasks([]);
    }
  }, [activeBoardId]);


  const fetchTasks = async () => {
    if (!activeBoardId) return;
    try {
      const res = await axios.get(`http://localhost:5000/api/tasks?board=${activeBoardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const leaveBoard = async (boardId: string) => {
    if (!window.confirm('Вы действительно хотите выйти из этой доски?')) return;

    try {
      await axios.delete(`http://localhost:5000/api/boards/${boardId}/leave`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success('Вы вышли из доски');

      // Перезагружаем список досок
      const res = await axios.get<Board[]>('http://localhost:5000/api/boards', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBoards(res.data);

      // Если мы были на этой доске — переключаемся на первую доступную
      if (activeBoardId === boardId) {
        setActiveBoardId(res.data[0]?._id || null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Не удалось выйти');
    }
  };

  const deleteBoard = async (boardId: string) => {
    if (!window.confirm('Вы уверены? Доска и ВСЕ задачи будут удалены БЕЗВОЗВРАТНО!')) return;

    try {
      await axios.delete(`http://localhost:5000/api/boards/${boardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success('Доска удалена');

      const res = await axios.get<Board[]>('http://localhost:5000/api/boards', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBoards(res.data);

      // Переключаемся на первую оставшуюся доску
      setActiveBoardId(res.data[0]?._id || null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Не удалось удалить доску');
    }
  };

  const fetchArchivedTasks = async () => {
    if (!activeBoardId) {
      setArchivedTasks([]);
      return;
    }

    try {
      const res = await axios.get('http://localhost:5000/api/tasks/archive', {
        headers: { Authorization: `Bearer ${token}` },
        params: { board: activeBoardId },          // ← вот это ключевое добавление
      });

      setArchivedTasks(
        res.data.sort((a: Task, b: Task) =>
          new Date(b.archivedAt || 0).getTime() - new Date(a.archivedAt || 0).getTime()
        )
      );
    } catch (err) {
      console.error('Ошибка загрузки архива:', err);
      toast.error('Не вдалося завантажити архів');
    }
  };

  const fetchStats = async () => {
    if (!activeBoardId) {
      setStats({
        total: 0,
        active: 0,
        done: 0,
        overdue: 0,
        archived: 0,
        byStatus: { 'To Do': 0, 'In Progress': 0, 'Done': 0 },
        byPriority: { Low: 0, Medium: 0, High: 0 },
        byLabel: {},
        byTag: {},
        recentOverdue: [],
      });
      return;
    }

    try {
      const params = { board: activeBoardId };

      const activeRes = await axios.get<Task[]>(
        'http://localhost:5000/api/tasks',
        {
          headers: { Authorization: `Bearer ${token}` },
          params,   // ← вот это главное!
        }
      );

      const archiveRes = await axios.get<Task[]>(
        'http://localhost:5000/api/tasks/archive',
        {
          headers: { Authorization: `Bearer ${token}` },
          params,   // ← и здесь тоже
        }
      );

      const activeTasks = activeRes.data;
      const archivedTasks = archiveRes.data;
      const allTasks = [...activeTasks, ...archivedTasks];

      // ────────────────────────────────────────────────
      // Дальше подсчёты остаются почти без изменений
      // Только теперь они будут считаться только по текущей доске
      // ────────────────────────────────────────────────

      const active = activeTasks.length;
      const done = activeTasks.filter(t => t.status === 'Done').length;
      const overdue = activeTasks.filter(t =>
        t.deadline && new Date(t.deadline) < new Date() && t.status !== 'Done'
      ).length;
      const archived = archivedTasks.length;

      const byStatus = {
        'To Do': activeTasks.filter(t => t.status === 'To Do').length,
        'In Progress': activeTasks.filter(t => t.status === 'In Progress').length,
        'Done': done,
      };

      const byPriority = {
        Low: activeTasks.filter(t => t.priority === 'Low').length,
        Medium: activeTasks.filter(t => t.priority === 'Medium').length,
        High: activeTasks.filter(t => t.priority === 'High').length,
      };

      // метки (только активные задачи)
      const labelCount: Record<string, number> = {};
      activeTasks.forEach(t => {
        t.labels?.forEach(l => {
          labelCount[l.name] = (labelCount[l.name] || 0) + 1;
        });
      });
      const topLabels = Object.entries(labelCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // теги аналогично
      const tagCount: Record<string, number> = {};
      activeTasks.forEach(t => {
        t.tags?.forEach(tag => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      });
      const topTags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // просроченные
      const recentOverdue = activeTasks
        .filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'Done')
        .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
        .slice(0, 5);

      setStats({
        total: allTasks.length,
        active,
        done,
        overdue,
        archived,
        byStatus,
        byPriority,
        topLabels,
        topTags,
        recentOverdue,
      });
    } catch (err) {
      console.error('Ошибка загрузки статистики:', err);
      toast.error('Не вдалося завантажити статистику');
    }
  };

  const loadUserInfo = useCallback(async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserId(res.data._id);
      setCurrentUsername(res.data.username);
      setNewUsername(res.data.username);
      setCurrentDisplayName(res.data.displayName || res.data.username);
      setNewDisplayName(res.data.displayName || res.data.username);
      setAvatar(res.data.avatar || '');
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const loadFriends = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/friends', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriendsData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const sendFriendRequest = async (username: string) => {
    try {
      await axios.post(
        'http://localhost:5000/api/friends/request',
        { username },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Запрос в друзья отправлен!', {
        position: "top-right",
        autoClose: 3000,
        theme: darkMode ? 'dark' : 'light',
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Ошибка отправки', {
        position: "top-right",
        theme: darkMode ? 'dark' : 'light',
      });
    }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      await axios.put(`http://localhost:5000/api/friends/${requestId}/accept`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadFriends();
    } catch (err) {
      toast.error('Ошибка', {
        position: "top-right",
        theme: darkMode ? 'dark' : 'light',
      });
    }
  };

  const rejectRequest = async (requestId: string) => {
    try {
      await axios.put(`http://localhost:5000/api/friends/${requestId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadFriends();
    } catch (err) {
      toast.error('Ошибка', {
        position: "top-right",
        theme: darkMode ? 'dark' : 'light',
      });
    }
  };

  const openProfileModal = () => {
    setShowProfileModal(true);
    setProfileError('');
    setProfileSuccess('');
  };

  const handleChangeUsername = async () => {
    if (newUsername === currentUsername) {
      setProfileError('Новий логін такий самий як поточний');
      return;
    }
    try {
      const res = await axios.put(
        'http://localhost:5000/api/auth/change-username',
        { newUsername },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCurrentUsername(res.data.username);
      setProfileSuccess('Логін успішно змінено');
      setProfileError('');
    } catch (err: any) {
      setProfileError(err.response?.data?.message || 'Помилка зміни логіну');
      setProfileSuccess('');
    }
  };

  const handleChangeDisplayName = async () => {
    if (newDisplayName === currentDisplayName) {
      setProfileError('Новий нік такий самий як поточний');
      return;
    }
    try {
      const res = await axios.put(
        'http://localhost:5000/api/auth/change-displayname',
        { newDisplayName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCurrentDisplayName(res.data.displayName);
      setProfileSuccess('Нік успішно змінено');
      setProfileError('');
    } catch (err: any) {
      setProfileError(err.response?.data?.message || 'Помилка зміни ніку');
      setProfileSuccess('');
    }
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) {
      setProfileError('Оберіть файл для аватарки');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', avatarFile);

    try {
      const res = await axios.post(
        'http://localhost:5000/api/auth/upload-avatar',
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setAvatar(res.data.avatar);
      setProfileSuccess('Аватарка оновлена');
      setProfileError('');
      setAvatarFile(null);
    } catch (err: any) {
      setProfileError(err.response?.data?.message || 'Помилка завантаження аватарки');
      setProfileSuccess('');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setProfileError('Нові паролі не співпадають');
      return;
    }
    try {
      await axios.put(
        'http://localhost:5000/api/auth/change-password',
        { oldPassword, newPassword, confirmPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfileSuccess('Пароль успішно змінено');
      setProfileError('');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setProfileError(err.response?.data?.message || 'Помилка зміни пароля');
      setProfileSuccess('');
    }
  };

  const displayedTasks = useMemo(() => {
    if (taskFilter === 'all' || !currentUser?._id) {
      return tasks;
    }

    return tasks.filter((task: Task) =>
      task.createdBy?._id === currentUser._id
    );
  }, [tasks, taskFilter, currentUser?._id]);   // ← ОБЯЗАТЕЛЬНО все 3 зависимости!

  const onDragEnd = async (result: DropResult) => {
    console.log('Drag ended:', result);
    const { source, destination, draggableId } = result;

    if (!destination) return;

    // Ничего не изменилось
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceColumn = source.droppableId;
    const destColumn = destination.droppableId;

    // Находим перемещаемую задачу
    const movedTask = displayedTasks.find(t => t._id === draggableId);
    if (!movedTask) return;

    // Случай 1: перемещение между колонками
    if (sourceColumn !== destColumn) {
      try {
        await axios.put(
          `http://localhost:5000/api/tasks/${movedTask._id}`,
          { ...movedTask, status: destColumn as Task['status'], order: 0 },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        fetchTasks();
      } catch (err) {
        console.error('Ошибка при смене статуса:', err);
      }
      return;
    }

    // Случай 2: перестановка внутри одной колонки
    if (sourceColumn === destColumn) {
      const columnTasks = displayedTasks
        .filter(t => t.status === sourceColumn)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      // Удаляем перемещаемую задачу из списка
      const newColumnTasks = [...columnTasks];
      const [removed] = newColumnTasks.splice(source.index, 1);

      // Вставляем на новое место
      newColumnTasks.splice(destination.index, 0, removed);

      // Пересчитываем order для всех задач в колонке (0, 1, 2, 3...)
      const updates = newColumnTasks.map((task, idx) => ({
        _id: task._id,
        order: idx,
      }));

      try {
        // Обновляем порядок на сервере (по одной задаче)
        await Promise.all(
          updates.map(update =>
            axios.put(
              `http://localhost:5000/api/tasks/${update._id}`,
              { order: update.order },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );

        fetchTasks();
      } catch (err) {
        console.error('Ошибка при обновлении порядка:', err);
      }
    }
  };

  const sortTasks = (tasksInColumn: Task[], sortOption: SortOption): Task[] => {
    const copy = [...tasksInColumn];

    switch (sortOption) {
      case 'default':
        return copy.sort((a, b) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          // Если order одинаковый — по дате создания (новые сверху)
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
      case 'title-asc':
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case 'title-desc':
        return copy.sort((a, b) => b.title.localeCompare(a.title));
      case 'priority-high':
        const prioHigh = { High: 3, Medium: 2, Low: 1 };
        return copy.sort((a, b) => (prioHigh[b.priority] || 0) - (prioHigh[a.priority] || 0));
      case 'priority-low':
        const prioLow = { Low: 3, Medium: 2, High: 1 };
        return copy.sort((a, b) => (prioLow[b.priority] || 0) - (prioLow[a.priority] || 0));
      case 'deadline-asc':
        return copy.sort((a, b) => {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return da - db;
        });
      case 'deadline-desc':
        return copy.sort((a, b) => {
          const da = a.deadline ? new Date(a.deadline).getTime() : -Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : -Infinity;
          return db - da;
        });
      case 'overdue-first':
        return copy.sort((a, b) => {
          const overA = a.deadline && new Date(a.deadline) < new Date();
          const overB = b.deadline && new Date(b.deadline) < new Date();
          if (overA && !overB) return -1;
          if (!overA && overB) return 1;
          return 0;
        });
      default:
        return copy;
    }
  };

  const filteredTasks = useMemo(() => {
    return displayedTasks.filter(task => {
      const lowerTitle = task.title.toLowerCase();
      const lowerDesc = task.description?.toLowerCase() || '';

      // Текстовый поиск
      if (parsedFilters.text) {
        const words = parsedFilters.text.split(/\s+/);
        const matchText = words.every((word: string) =>
          lowerTitle.includes(word) || lowerDesc.includes(word)
        );
        if (!matchText) return false;
      }

      // Статус
      if (parsedFilters.status && task.status.toLowerCase() !== parsedFilters.status) {
        return false;
      }

      // Приоритет
      if (parsedFilters.priority && task.priority !== parsedFilters.priority) {
        return false;
      }

      // Дедлайн
      if (parsedFilters.deadline) {
        if (!task.deadline) return false;
        const taskDate = new Date(task.deadline).getTime();
        const filterDate = parsedFilters.deadline.value.getTime();

        switch (parsedFilters.deadline.operator) {
          case '>':
            if (taskDate <= filterDate) return false;
            break;
          case '<':
            if (taskDate >= filterDate) return false;
            break;
          default:
            // =
            if (Math.abs(taskDate - filterDate) > 86400000) return false; // день
        }
      }

      // Метка (label)
      if (parsedFilters.label) {
        if (!task.labels?.some(l => l.name.toLowerCase() === parsedFilters.label)) {
          return false;
        }
      }

      // Тег
      if (parsedFilters.tag) {
        if (!task.tags?.some(t => t.toLowerCase() === parsedFilters.tag)) {
          return false;
        }
      }

      return true;
    });
  }, [tasks, parsedFilters]);

  // Вместо того, чтобы сразу использовать tasks в колонках


  // Вместо простого tasks используем это


  const getColumnTasks = (col: string) => {
    const colTasks = filteredTasks.filter((t) => t.status === col);
    const sortOpt = sortOptions[col] || 'default';
    return sortTasks(colTasks, sortOpt);
  };

  const openAddModal = (col: 'To Do' | 'In Progress' | 'Done') => {
    setSelectedColumn(col);
    setCurrentTask(null);
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setDeadline('');
    setSelectedLabels([]);
    setTags([]);
    setTagsInput('');
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setCurrentTask(task);
    setTitle(task.title || '');
    setDescription(task.description || '');
    setPriority(task.priority);
    setDeadline(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
    setSelectedLabels(task.labels || []);
    setTags(task.tags || []);
    setTagsInput('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.info('Назва задачі обов\'язкова!', {
        position: "top-right",
        autoClose: 3000,
        theme: darkMode ? 'dark' : 'light',
      });
      return;
    }

    try {
      const taskData = {
        title,
        description,
        priority,
        deadline: deadline || undefined,
        status: currentTask ? currentTask.status : selectedColumn,
        labels: selectedLabels,
        tags,
        board: activeBoardId,  // ← обязательно!
        order: currentTask ? undefined : getColumnTasks(selectedColumn).length,
      };

      console.log('Надсилаю задачу:', taskData); // ← додай цей лог!

      if (currentTask) {
        await axios.put(`http://localhost:5000/api/tasks/${currentTask._id}`, taskData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post('http://localhost:5000/api/tasks', taskData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      fetchTasks();
      setShowModal(false);
    } catch (err: any) {
      console.error('Помилка збереження:', err.response?.data || err.message);
      toast.error('Не вдалося зберегти задачу: ' + (err.response?.data?.message || 'невідома помилка'), {
        position: "top-right",
        theme: darkMode ? 'dark' : 'light',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Переместить задачу в архив?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/tasks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTasks(); // обновляем основную доску
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await axios.post(`http://localhost:5000/api/tasks/${id}/restore`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTasks();
      fetchArchivedTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm('Удалить задачу НАВСЕГДА? Это действие нельзя отменить.')) return;
    try {
      await axios.delete(`http://localhost:5000/api/tasks/${id}/permanent`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchArchivedTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleLabel = (label: Label) => {
    setSelectedLabels((prev) =>
      prev.some((l) => l.name === label.name)
        ? prev.filter((l) => l.name !== label.name)
        : [...prev, label]
    );
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTagsInput(value);

    if (value.endsWith(',') || value.endsWith(' ')) {
      const newTag = value.trim().replace(/[ ,]+$/, '').replace(/^#/, '');
      if (newTag && !tags.includes(newTag)) {
        setTags((prev) => [...prev, newTag]);
      }
      setTagsInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const isOverdue = (deadline?: string) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  const getPriorityStyle = (p: string) => {
    switch (p) {
      case 'High': return { borderLeft: '5px solid #dc3545' };
      case 'Medium': return { borderLeft: '5px solid #ffc107' };
      case 'Low': return { borderLeft: '5px solid #198754' };
      default: return {};
    }
  };

  return (
    <div className={`min-vh-100 ${darkMode ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
      <Container fluid className="py-4">
        {/* Шапка */}
        <Row className="align-items-center mb-4">
          <Col>
            <div className="d-flex align-items-center gap-3">
              {avatar ? (
                <Image src={`http://localhost:5000${avatar}`} roundedCircle width={48} height={48} alt="Аватар" />
              ) : (
                <FontAwesomeIcon icon={faUser} size="2x" />
              )}
              <h1 className="fw-bold mb-0">
                {currentUser ? currentUser.displayName : 'Користувач'}
              </h1>

              {activeBoardId && boards.find(b => b._id === activeBoardId)?.owner && (
                <div className="text-muted fs-6 mt-1">
                  Доска пользователя {boards.find(b => b._id === activeBoardId).owner.displayName}
                  {boards.find(b => b._id === activeBoardId).owner._id === userId && ' (это вы)'}
                </div>
              )}

              {boards.find(b => b._id === activeBoardId)?.owner && boards.find(b => b._id === activeBoardId).owner._id !== userId && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="ms-3"
                  onClick={() => sendFriendRequest(boards.find(b => b._id === activeBoardId).owner.username)}
                >
                  Добавить в друзья
                </Button>
              )}

              {/* Комбобокс выбора доски */}
              {boards.length > 0 && (
                <Form.Select
                  value={activeBoardId || ''}
                  onChange={(e) => setActiveBoardId(e.target.value)}
                  style={{ width: 'auto', minWidth: '180px' }}
                >
                  {boards.map(board => (
                    <option key={board._id} value={board._id}>
                      {board.name} (Участников: {board.membersCount} / 5)
                    </option>
                  ))}
                </Form.Select>
              )}

              {activeBoardId && (
                <div className="d-flex gap-2">
                  <Button variant="outline-danger" size="sm" onClick={() => leaveBoard(activeBoardId)}>
                    Выйти из доски
                  </Button>

                  {/* временно всегда показываем удалить для теста */}
                  <Button variant="danger" size="sm" onClick={() => deleteBoard(activeBoardId)}>
                    Удалить доску
                  </Button>
                </div>
              )}

              {/* Кнопка создания новой доски */}
              <Button
                variant="outline-success"
                size="sm"
                onClick={() => setShowNewBoardModal(true)}
                disabled={boards.length >= 3}
              >
                <FontAwesomeIcon icon={faPlus} className="me-1" />
                Нова доска {boards.length >= 3 && '(ліміт)'}
              </Button>

              <Button
                variant="outline-primary"
                size="sm"
                className="ms-2"
                onClick={() => setShowJoinModal(true)}
                disabled={!activeBoardId}
              >
                <FontAwesomeIcon icon={faUserPlus} className="me-1" />
                Пригласити
              </Button>

            </div>

          </Col>
          <Button
            variant="outline-warning"
            className="ms-3"
            onClick={() => {
              fetchArchivedTasks();
              setShowArchiveModal(true);
            }}
          >
            <FontAwesomeIcon icon={faTrash} className="me-1" /> Архив
          </Button>
          <Button
            variant="outline-info"
            className="ms-3"
            onClick={() => {
              fetchStats();
              setShowStatsModal(true);
            }}
          >
            <FontAwesomeIcon icon={faChartBar} className="me-1" /> Статистика
          </Button>

          <Button
            variant="outline-info"
            size="sm"
            onClick={() => {
              loadFriends();
              setShowFriendsModal(true);
            }}
          >
            <FontAwesomeIcon icon={faUser} className="me-1" /> Друзья
          </Button>


          <Col xs="auto" className="d-flex align-items-center gap-3 flex-wrap">
            <Button
              variant={darkMode ? 'outline-light' : 'outline-secondary'}
              onClick={() => setDarkMode(prev => !prev)}
              title={darkMode ? 'Перейти в світлий режим' : 'Перейти в темний режим'}
            >
              <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
            </Button>

            <InputGroup style={{ width: '380px', minWidth: '280px' }}>
              <InputGroup.Text><FontAwesomeIcon icon={faSearch} /></InputGroup.Text>
              <FormControl
                placeholder="Поиск... (status:done priority:high #frontend label:Bug)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <Button
                  variant="outline-secondary"
                  onClick={() => setSearchQuery('')}
                >
                  ×
                </Button>
              )}
            </InputGroup>

            <div className="d-flex align-items-center gap-3 mb-3">
            </div>


            <div className="d-flex gap-2 mb-3">
              <Button
                variant={taskFilter === 'all' ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setTaskFilter('all')}
              >
                Все задачи
              </Button>
              <Button
                variant={taskFilter === 'mine' ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setTaskFilter('mine')}
                disabled={!currentUser || loadingUser}
              >
                Мои задачи
              </Button>
            </div>

            <Button variant="outline-primary" onClick={openProfileModal}>
              <FontAwesomeIcon icon={faUser} className="me-1" /> Аккаунт
            </Button>
          </Col>        </Row>

        <DragDropContext onDragEnd={onDragEnd}>
          <Row key={taskFilter} className="g-4">
            {columns.map((col) => (
              <Col key={col} md={4}>
                <Card className="h-100 shadow-sm" bg={darkMode ? 'dark' : 'white'}>
                  <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div className="d-flex align-items-center gap-3">
                      <h5 className="mb-0">{col}</h5>
                      <Badge bg={col === 'Done' ? 'success' : col === 'In Progress' ? 'primary' : 'secondary'}>
                        {getColumnTasks(col).length}
                      </Badge>
                    </div>

                    <Form.Select
                      size="sm"
                      style={{ width: 'auto', minWidth: '160px' }}
                      value={sortOptions[col] || 'default'}
                      onChange={(e) =>
                        setSortOptions((prev) => ({ ...prev, [col]: e.target.value as SortOption }))
                      }
                    >
                      <option value="default">За замовчуванням</option>
                      <option value="title-asc">Назва A → Я</option>
                      <option value="title-desc">Назва Я → A</option>
                      <option value="priority-high">Пріоритет (високий першим)</option>
                      <option value="priority-low">Пріоритет (низький першим)</option>
                      <option value="deadline-asc">Дедлайн (найближчий першим)</option>
                      <option value="deadline-desc">Дедлайн (найдальший першим)</option>
                      <option value="overdue-first">Просрочені першими</option>
                    </Form.Select>
                  </Card.Header>

                  <StrictModeDroppable droppableId={col} key={col} isDropDisabled={false}>
                    {(provided, snapshot) => (
                      <Card.Body
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        style={{
                          minHeight: '300px',
                          backgroundColor: snapshot.isDraggingOver
                            ? darkMode
                              ? '#2d3748'
                              : '#f0f4f8'
                            : 'transparent',
                          transition: 'background-color 0.2s ease',
                        }}
                      >
                        {getColumnTasks(col).map((task, index) => (
                          <Draggable key={task._id} draggableId={task._id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={provided.draggableProps.style} // ← только позиционирование
                                className="mb-3"
                              >
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  // НЕ спредим draggableProps сюда!
                                  style={{
                                    opacity: snapshot.isDragging ? 0.8 : 1,
                                    cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                                  }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <Card
                                    style={{
                                      ...getPriorityStyle(task.priority),
                                      opacity: snapshot.isDragging ? 0.8 : 1,
                                      boxShadow: snapshot.isDragging ? '0 10px 30px rgba(0,0,0,0.3)' : 'none',
                                    }}
                                    className="shadow-sm"
                                    bg={darkMode ? 'secondary' : 'white'}
                                  >
                                    <Card.Body>
                                      {/* весь твой контент карточки */}
                                      <div className="d-flex justify-content-between">
                                        <h6 className="mb-2">{task.title}</h6>
                                        <div>
                                          <Button variant="link" size="sm" onClick={() => openEditModal(task)}>
                                            <FontAwesomeIcon icon={faEdit} />
                                          </Button>
                                          <Button variant="link" size="sm" className="text-danger" onClick={() => handleDelete(task._id)}>
                                            <FontAwesomeIcon icon={faTrash} />
                                          </Button>
                                        </div>
                                      </div>

                                      {task.description && (
                                        <p className="small text-muted mb-2">
                                          {task.description.substring(0, 80)}{task.description.length > 80 ? '...' : ''}
                                        </p>
                                      )}

                                      {/* метки и теги */}
                                      <div className="d-flex flex-wrap gap-1 mt-2 mb-2">
                                        {task.labels?.map((label) => (
                                          <Badge key={label.name} pill style={{ backgroundColor: label.color, color: 'white' }}>
                                            {label.name}
                                          </Badge>
                                        ))}
                                        {task.tags?.map((tag) => (
                                          <Badge key={tag} bg="secondary" pill className="text-white">
                                            #{tag}
                                          </Badge>
                                        ))}
                                      </div>

                                      <div className="d-flex justify-content-between align-items-center small">
                                        {/* приоритет, дедлайн, иконки */}
                                        <div>
                                          {task.priority === 'High' && <FontAwesomeIcon icon={faExclamationTriangle} className="text-danger me-1" />}
                                          {task.deadline && (
                                            <span className={isOverdue(task.deadline) ? 'text-danger' : 'text-muted'}>
                                              <FontAwesomeIcon icon={faClock} className="me-1" />
                                              {new Date(task.deadline).toLocaleDateString('uk-UA')}
                                            </span>
                                          )}
                                        </div>
                                        {task.status === 'Done' && <FontAwesomeIcon icon={faCheckCircle} className="text-success" />}
                                      </div>
                                      <div className="d-flex align-items-center mt-3 pt-2 border-top small text-muted">
                                        {task.createdBy?.avatar ? (
                                          <Image
                                            src={`http://localhost:5000${task.createdBy.avatar}`}
                                            roundedCircle
                                            width={28}
                                            height={28}
                                            className="me-2 flex-shrink-0"
                                            alt={task.createdBy.displayName}
                                          />
                                        ) : (
                                          <div
                                            className="me-2 rounded-circle bg-secondary text-white d-flex align-items-center justify-content-center flex-shrink-0"
                                            style={{ width: 28, height: 28, fontSize: '14px' }}
                                          >
                                            {task.createdBy?.displayName?.charAt(0)?.toUpperCase() || '?'}
                                          </div>
                                        )}
                                        <div>
                                          <span className="fw-medium">
                                            {task.createdBy?.displayName || 'Неизвестный автор'}
                                          </span>
                                          {task.createdBy?._id === userId && (
                                            <Badge bg="secondary" className="ms-2" pill>
                                              вы
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </Card.Body>
                                  </Card>
                                </motion.div>
                              </div>
                            )}
                          </Draggable>))}
                        {provided.placeholder}
                      </Card.Body>
                    )}
                  </StrictModeDroppable>

                  <Card.Footer className="text-center">
                    <Button variant="outline-primary" size="sm" onClick={() => openAddModal(col)}>
                      <FontAwesomeIcon icon={faPlus} className="me-1" /> Додати картку
                    </Button>
                  </Card.Footer>
                </Card>
              </Col>
            ))}
          </Row>
        </DragDropContext>
      </Container>

      {/* Модалка задачи */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{currentTask ? 'Редагувати картку' : 'Нова картка'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Назва</Form.Label>
              <Form.Control value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Опис</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Пріоритет</Form.Label>
              <Form.Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="Low">Низький</option>
                <option value="Medium">Середній</option>
                <option value="High">Високий</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Дедлайн</Form.Label>
              <Form.Control type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Form.Group>

            {/* Метки */}
            <Form.Group className="mb-4">
              <Form.Label>Метки</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {AVAILABLE_LABELS.map((label) => (
                  <Badge
                    key={label.name}
                    pill
                    style={{
                      backgroundColor: label.color,
                      color: 'white',
                      cursor: 'pointer',
                      opacity: selectedLabels.some((l) => l.name === label.name) ? 1 : 0.6,
                      border: selectedLabels.some((l) => l.name === label.name) ? '2px solid #fff' : '1px solid transparent',
                    }}
                    onClick={() => toggleLabel(label)}
                  >
                    {label.name}
                  </Badge>
                ))}
              </div>
            </Form.Group>

            {/* Теги */}
            <Form.Group className="mb-3">
              <Form.Label>Теги (через пробіл або кому)</Form.Label>
              <div className="d-flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <Badge key={tag} bg="light" text="dark" className="d-flex align-items-center gap-1 px-2 py-1">
                    #{tag}
                    <CloseButton
                      onClick={() => removeTag(tag)}
                      style={{ fontSize: '10px', opacity: 0.7 }}
                    />
                  </Badge>
                ))}
              </div>
              <Form.Control
                type="text"
                value={tagsInput}
                onChange={handleTagsChange}
                placeholder="Наприклад: urgent api frontend,"
              />
              <Form.Text className="text-muted small">
                Натисніть пробіл або кому після введення тегу
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Скасувати
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Зберегти
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Модалка профиля (без изменений) */}
      <Modal show={showProfileModal} onHide={() => setShowProfileModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Мій аккаунт</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {profileError && <Alert variant="danger">{profileError}</Alert>}
          {profileSuccess && <Alert variant="success">{profileSuccess}</Alert>}

          <div className="text-center mb-4">
            {avatar ? (
              <Image
                src={`http://localhost:5000${avatar}`}
                roundedCircle
                width={120}
                height={120}
                className="mb-3"
                alt="Аватар"
              />
            ) : (
              <FontAwesomeIcon icon={faUser} size="5x" className="mb-3 text-secondary" />
            )}
          </div>

          <h6 className="mb-3">Поточний логін: <strong>{currentUsername}</strong></h6>

          <Form.Group className="mb-4">
            <Form.Label>Новий логін</Form.Label>
            <Form.Control value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            <Button variant="primary" size="sm" className="mt-2" onClick={handleChangeUsername}>
              Змінити логін
            </Button>
          </Form.Group>

          <hr />

          <h6 className="mb-3">Поточний нік: <strong>{currentDisplayName}</strong></h6>

          <Form.Group className="mb-4">
            <Form.Label>Новий нік (відображається іншим)</Form.Label>
            <Form.Control value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} />
            <Button variant="primary" size="sm" className="mt-2" onClick={handleChangeDisplayName}>
              Змінити нік
            </Button>
          </Form.Group>

          <hr />

          <h6 className="mb-3">Аватарка</h6>
          <Form.Group className="mb-4">
            <Form.Label>Завантажити нову аватарку (jpg, png)</Form.Label>
            <Form.Control
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (e.target.files && e.target.files[0]) {
                  setAvatarFile(e.target.files[0]);
                }
              }}
            />
            <Button variant="primary" size="sm" className="mt-2" onClick={handleUploadAvatar} disabled={!avatarFile}>
              Завантажити
            </Button>
          </Form.Group>

          <hr />

          <h6 className="mb-3 mt-4">Зміна пароля</h6>

          <Form.Group className="mb-3">
            <Form.Label>Старий пароль</Form.Label>
            <Form.Control
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Новий пароль</Form.Label>
            <Form.Control
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label>Підтвердити новий пароль</Form.Label>
            <Form.Control
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </Form.Group>

          <Button variant="primary" className="w-100 mb-3" onClick={handleChangePassword}>
            Змінити пароль
          </Button>

          <Button
            variant="outline-danger"
            className="w-100"
            onClick={() => {
              if (window.confirm('Ви дійсно хочете вийти з аккаунту?')) {
                localStorage.removeItem('token');
                window.location.href = '/login';
              }
            }}
          >
            Вийти з аккаунту
          </Button>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowProfileModal(false)}>
            Закрити
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showArchiveModal}
        onHide={() => setShowArchiveModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Архив — {boards.find(b => b._id === activeBoardId)?.name || 'Дошка'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {archivedTasks.length === 0 ? (
            <p className="text-center text-muted">Архив пуст</p>
          ) : (
            <div className="d-flex flex-column gap-3">
              {archivedTasks?.length > 0 ? (
                archivedTasks.map(task => (
                  <Card key={task._id} bg={darkMode ? 'secondary' : 'light'}>
                    <Card.Body className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-1">{task.title}</h6>
                        <small className="text-muted">
                          Удалена: {task.archivedAt ? new Date(task.archivedAt).toLocaleString('uk-UA') : 'неизвестно'}
                        </small>
                      </div>
                      <div>
                        <Button variant="outline-success" size="sm" className="me-2" onClick={() => handleRestore(task._id)}>
                          Восстановить
                        </Button>
                        <Button variant="outline-danger" size="sm" onClick={() => handlePermanentDelete(task._id)}>
                          Удалить навсегда
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted py-4">Архив пуст</p>
              )}            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowArchiveModal(false)}>
            Закрыть
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showStatsModal}
        onHide={() => setShowStatsModal(false)}
        size="xl"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Статистика — {boards.find(b => b._id === activeBoardId)?.name || 'Дошка'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-4 mb-4">
            <Col md={3}>
              <Card bg={darkMode ? 'dark' : 'light'} text={darkMode ? 'light' : 'dark'}>
                <Card.Body className="text-center">
                  <h5>Всего задач</h5>
                  <h2>{stats.total}</h2>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card bg={darkMode ? 'dark' : 'light'} text={darkMode ? 'light' : 'dark'}>
                <Card.Body className="text-center">
                  <h5>Активных</h5>
                  <h2>{stats.active}</h2>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card bg={darkMode ? 'dark' : 'light'} text={darkMode ? 'light' : 'dark'}>
                <Card.Body className="text-center">
                  <h5>Завершённых</h5>
                  <h2>{stats.done}</h2>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card bg="danger" text="white" className="text-center">
                <Card.Body>
                  <h5>Просрочено</h5>
                  <h2>{stats.overdue}</h2>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Row className="g-4">
            <Col md={6}>
              <Card>
                <Card.Body>
                  <h5 className="text-center mb-3">По статусам</h5>
                  <Pie
                    data={{
                      labels: Object.keys(stats.byStatus),
                      datasets: [{
                        data: Object.values(stats.byStatus),
                        backgroundColor: ['#0d6efd', '#ffc107', '#198754'],
                      }]
                    }}
                    options={{ responsive: true }}
                  />
                </Card.Body>
              </Card>
            </Col>

            <Col md={6}>
              <Card>
                <Card.Body>
                  <h5 className="text-center mb-3">По приоритетам</h5>
                  <Bar
                    data={{
                      labels: ['Low', 'Medium', 'High'],
                      datasets: [{
                        label: 'Количество',
                        data: [stats.byPriority.Low, stats.byPriority.Medium, stats.byPriority.High],
                        backgroundColor: ['#198754', '#ffc107', '#dc3545'],
                      }]
                    }}
                    options={{ responsive: true, scales: { y: { beginAtZero: true } } }}
                  />
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Топ метки и теги */}
          <Row className="mt-4">
            <Col md={6}>
              <Card>
                <Card.Body>
                  <h5>Топ-5 меток</h5>
                  {stats.topLabels?.length > 0 ? (
                    stats.topLabels.map((item: any, i: number) => (
                      <div key={i} className="d-flex justify-content-between mb-2">
                        <span>{item.name}</span>
                        <Badge bg="primary">{item.count}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted text-center">Нет меток</p>
                  )}
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card>
                <Card.Body>
                  <h5>Топ-5 тегов</h5>
                  {stats.topTags?.length > 0 ? (
                    stats.topTags.map((item: any, i: number) => (
                      <div key={i} className="d-flex justify-content-between mb-2">
                        <span>#{item.name}</span>
                        <Badge bg="secondary">{item.count}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted text-center">Нет тегов</p>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Просроченные */}
          {stats.recentOverdue.length > 0 && (
            <Card className="mt-4">
              <Card.Body>
                <h5>Самые старые просроченные задачи</h5>
                <ul className="list-group">
                  {stats.recentOverdue.map((task: Task) => (
                    <li key={task._id} className="list-group-item d-flex justify-content-between">
                      <div>
                        <strong>{task.title}</strong>
                        <small className="text-muted d-block">
                          Дедлайн: {new Date(task.deadline!).toLocaleDateString('uk-UA')}
                        </small>
                      </div>
                      <Badge bg="danger">Просрочено</Badge>
                    </li>
                  ))}
                </ul>
              </Card.Body>
            </Card>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowStatsModal(false)}>
            Закрыть
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showNewBoardModal} onHide={() => setShowNewBoardModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Нова дошшка</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group>
              <Form.Label>Назва дошшки <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={newBoardName}
                onChange={e => setNewBoardName(e.target.value)}
                placeholder="Моя нова дошшка"
                required
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowNewBoardModal(false)}>
            Скасувати
          </Button>
          <Button
            variant="primary"
            disabled={!newBoardName.trim()}
            onClick={async () => {
              try {
                // Создаём доску
                const res = await axios.post(
                  'http://localhost:5000/api/boards',
                  { name: newBoardName.trim() },
                  { headers: { Authorization: `Bearer ${token}` } }
                );

                // Вместо добавления одной — перезагружаем ВЕСЬ список
                const boardsRes = await axios.get<Board[]>('http://localhost:5000/api/boards', {
                  headers: { Authorization: `Bearer ${token}` },
                });

                setBoards(boardsRes.data);

                // Находим только что созданную (по имени, или можно вернуть _id с бэкенда и искать по нему)
                const newBoard = boardsRes.data.find(b => b.name === newBoardName.trim());
                if (newBoard) {
                  setActiveBoardId(newBoard._id);
                  setInviteCode(newBoard.inviteCode || null);
                }

                setNewBoardName('');
                setShowNewBoardModal(false);
                toast.success('Дошка створена!');
              } catch (err: any) {
                toast.error(err.response?.data?.message || 'Помилка створення', {
                  position: "top-right",
                  theme: darkMode ? 'dark' : 'light',
                });
              }
            }}
          >
            Створити
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showJoinModal} onHide={() => setShowJoinModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Пригласить на доску</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {activeBoardId && boards.length > 0 ? (
            <div className="text-center mb-4">
              <h5>Код приглашения для текущей доски:</h5>
              {inviteCode ? (
                <>
                  <div className="p-3 bg-light border rounded d-inline-block fs-4 fw-bold">
                    {inviteCode}
                  </div>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="mt-2 ms-2"
                    onClick={() => navigator.clipboard.writeText(inviteCode)}
                  >
                    Скопировать
                  </Button>

                  {/* ← Вот сюда добавляем счётчик */}
                  <div className="mt-3">
                    {(() => {
                      const currentBoard = boards.find(b => b._id === activeBoardId);
                      if (!currentBoard) return null;

                      const remaining = currentBoard.maxMembers - currentBoard.membersCount;
                      return (
                        <div className={`fw-bold ${remaining === 0 ? 'text-danger' : 'text-success'}`}>
                          Осталось мест: {remaining} из {currentBoard.maxMembers}
                          {remaining === 0 && " (доска заполнена)"}
                        </div>
                      );
                    })()}
                  </div>

                  {boards.find(b => b._id === activeBoardId)?.inviteUsed && (
                    <Alert variant="warning" className="mt-3">
                      Этот код уже использован и недействителен
                    </Alert>
                  )}
                </>
              ) : (
                <p className="text-muted">Код приглашения ещё не сгенерирован</p>
              )}
              <p className="text-muted mt-3 small">
                Передайте этот код другому пользователю. Максимум 5 участников на доску.
              </p>
            </div>
          ) : (
            <p className="text-muted">Сначала выберите доску</p>
          )}

          <hr />

          <h6 className="mb-3">У меня есть код приглашения</h6>
          <Form>
            <Form.Control
              type="text"
              placeholder="Введите код"
              value={joinCodeInput}
              onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
            />
            {joinError && <Alert variant="danger" className="mt-2">{joinError}</Alert>}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowJoinModal(false)}>
            Закрыть
          </Button>
          <Button
            variant="primary"
            disabled={!joinCodeInput.trim()}
            onClick={async () => {
              try {
                const res = await axios.post(
                  'http://localhost:5000/api/boards/join',
                  { inviteCode: joinCodeInput.trim() },
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                // Добавляем новую доску
                setBoards(prev => [...prev, res.data]);
                // Переключаемся на неё
                setActiveBoardId(res.data._id);
                // Загружаем задачи сразу
                setTasks([]); // очистка на всякий случай
                fetchTasks(); // ← добавлено: загружаем задачи новой доски
                setJoinCodeInput('');
                setJoinError('');
                setShowJoinModal(false);
                toast.success('Вы успешно присоединились к доске!', {
                  position: "top-right",
                  autoClose: 3000,
                  theme: darkMode ? 'dark' : 'light',
                });
              } catch (err: any) {
                setJoinError(err.response?.data?.message || 'Ошибка присоединения');
              }
            }}
          >
            Присоединиться
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ==================== МОДАЛКА ДРУЗЕЙ ==================== */}
      <Modal show={showFriendsModal} onHide={() => setShowFriendsModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Друзья</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-4">
            <InputGroup>
              <FormControl
                placeholder="Введите логин пользователя..."
                value={friendUsernameInput || ''}
                onChange={e => setFriendUsernameInput(e.target.value.trim())}
              />
              <Button
                variant="primary"
                disabled={!friendUsernameInput?.trim()}
                onClick={async () => {
                  if (!friendUsernameInput?.trim()) return;
                  try {
                    await sendFriendRequest(friendUsernameInput.trim());
                    setFriendUsernameInput(''); // очистка после успеха
                    loadFriends();              // обновляем списки
                  } catch (err: any) {
                    // alert уже внутри sendFriendRequest, но можно добавить кастомное
                  }
                }}
              >
                Добавить в друзья
              </Button>
            </InputGroup>
            <Form.Text className="text-muted mt-1">
              Введите точный логин (username), чтобы отправить запрос
            </Form.Text>
          </div>

          <div className="d-flex mb-3 border-bottom">
            {['friends', 'incoming', 'outgoing'].map((tab) => (
              <Button
                key={tab}
                variant={activeFriendsTab === tab ? 'primary' : 'light'}
                className="flex-fill mx-1"
                onClick={() => setActiveFriendsTab(tab as any)}
              >
                {tab === 'friends' && `Мои друзья (${friendsData.friends.length})`}
                {tab === 'incoming' && `Ожидающие (${friendsData.incoming.length})`}
                {tab === 'outgoing' && `Отправленные (${friendsData.outgoing.length})`}
              </Button>
            ))}
          </div>

          {/* Мои друзья */}
          {activeFriendsTab === 'friends' && (
            friendsData.friends.length === 0 ? (
              <p className="text-center text-muted py-5">У вас пока нет друзей</p>
            ) : (
              friendsData.friends.map(f => (
                <div key={f._id} className="d-flex align-items-center gap-3 p-3 border-bottom">
                  {f.avatar ? (
                    <Image src={`http://localhost:5000${f.avatar}`} roundedCircle width={50} height={50} />
                  ) : (
                    <div className="bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: 50, height: 50 }}>
                      {f.displayName[0]}
                    </div>
                  )}
                  <div>
                    <strong>{f.displayName}</strong>
                    <div className="small text-muted">@{f.username}</div>
                  </div>
                </div>
              ))
            )
          )}

          {/* Ожидающие */}
          {activeFriendsTab === 'incoming' && (
            friendsData.incoming.length === 0 ? (
              <p className="text-center text-muted py-5">Нет входящих запросов</p>
            ) : (
              friendsData.incoming.map(req => (
                <div key={req.requestId} className="d-flex justify-content-between align-items-center p-3 border-bottom">
                  <div className="d-flex align-items-center gap-3">
                    {req.from?.avatar ? <Image src={`http://localhost:5000${req.from.avatar}`} roundedCircle width={48} height={48} /> : null}
                    <div>
                      <strong>{req.from?.displayName}</strong> (@{req.from?.username})
                    </div>
                  </div>
                  <div>
                    <Button variant="success" size="sm" onClick={() => acceptRequest(req.requestId)}>Принять</Button>
                    <Button variant="danger" size="sm" className="ms-2" onClick={() => rejectRequest(req.requestId)}>Отклонить</Button>
                  </div>
                </div>
              ))
            )
          )}

          {/* Отправленные */}
          {activeFriendsTab === 'outgoing' && (
            friendsData.outgoing.length === 0 ? (
              <p className="text-center text-muted py-5">Нет отправленных запросов</p>
            ) : (
              friendsData.outgoing.map(req => (
                <div key={req.requestId} className="d-flex justify-content-between align-items-center p-3 border-bottom">
                  <div className="d-flex align-items-center gap-3">
                    {req.to?.avatar ? <Image src={`http://localhost:5000${req.to.avatar}`} roundedCircle width={48} height={48} /> : null}
                    <div>
                      <strong>{req.to?.displayName}</strong> (@{req.to?.username})
                    </div>
                  </div>
                  <Button variant="outline-danger" size="sm" onClick={() => rejectRequest(req.requestId)}>Отменить</Button>
                </div>
              ))
            )
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowFriendsModal(false)}>
            Закрыть
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default TaskList;