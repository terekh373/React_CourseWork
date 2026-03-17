import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable, DropResult, DroppableProps } from 'react-beautiful-dnd';
import {
  Container, Row, Col, Card, Button, Modal, Form, Badge,
  InputGroup, FormControl, Alert, Image, CloseButton, Dropdown
} from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faSearch, faClock, faSun, faMoon,
  faExclamationTriangle, faCheckCircle, faUser, faChartBar, faUserPlus,
  faSignOutAlt, faBoxArchive, faUsers, faCopy, faLayerGroup,
  faFire, faCircleCheck, faHourglassHalf
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
import { useNavigate } from 'react-router-dom';
import Swal from "sweetalert2";
import logo from '../logo-nobg.png';

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

  const navigate = useNavigate();

  // ── Swal helper ──────────────────────────────────────────
  const swal = (opts: any) =>
    Swal.fire({
      background: darkMode ? '#1e1b3a' : '#ffffff',
      color: darkMode ? '#e2e8f0' : '#1e293b',
      confirmButtonColor: '#667eea',
      cancelButtonColor: darkMode ? '#374151' : '#9ca3af',
      customClass: {
        popup: 'swal-glass-popup',
        title: 'swal-glass-title',
        htmlContainer: 'swal-glass-text',
        confirmButton: 'swal-glass-confirm',
        cancelButton: 'swal-glass-cancel',
      },
      ...opts,
    });
    
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
    localStorage.setItem('darkMode', darkMode.toString());

    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [darkMode]);

  useEffect(() => {
    const newSocket = io(`${process.env.REACT_APP_API_URL}`, {
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
        const res = await axios.get<Board[]>(`${process.env.REACT_APP_API_URL}/api/boards`, {
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
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      } else {
        document.title = 'TaskFlow';
      }
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

  /*----------------Title----------------*/
  useEffect(() => {
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (showArchiveModal && boardName) {
      document.title = `Архів дошки "${boardName}" | TaskFlow`;
    } else if (boardName) {
      document.title = `Дошка "${boardName}" | TaskFlow`;
    }
  }, [showArchiveModal]);

  useEffect(() => {
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (showModal && boardName) {
      document.title = currentTask ? `Редагування задачі "${currentTask.title}" на "${boardName}" | TaskFlow` : `Створення задачі на "${boardName}" | TaskFlow`;
    } else if (boardName) {
      document.title = `Дошка "${boardName}" | TaskFlow`;
    }
  }, [showModal]);

  useEffect(() => {
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (showProfileModal && boardName) {
      document.title = `Перегляд профілю | TaskFlow`;
    } else if (boardName) {
      document.title = `Дошка "${boardName}" | TaskFlow`;
    }
  }, [showProfileModal]);

  useEffect(() => {
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (showStatsModal && boardName) {
      document.title = `Перегляд статистики "${boardName}" | TaskFlow`;
    } else if (boardName) {
      document.title = `Дошка "${boardName}" | TaskFlow`;
    }
  }, [showStatsModal]);

  useEffect(() => {
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (showNewBoardModal && boardName) {
      document.title = `Створення нової дошки | TaskFlow`;
    } else if (boardName) {
      document.title = `Дошка "${boardName}" | TaskFlow`;
    }
  }, [showNewBoardModal]);

  useEffect(() => {
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (showJoinModal && boardName) {
      document.title = `Запрошення на дошку "${boardName}" | TaskFlow`;
    } else if (boardName) {
      document.title = `Дошка "${boardName}" | TaskFlow`;
    }
  }, [showJoinModal]);

  useEffect(() => {
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (showFriendsModal && boardName) {
      document.title = `Мої друзі | TaskFlow`;
    } else if (boardName) {
      document.title = `Дошка "${boardName}" | TaskFlow`;
    }
  }, [showFriendsModal]);
  /*----------------Title----------------*/

  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!token) {
        setLoadingUser(false);
        return;
      }
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
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
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/tasks?board=${activeBoardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const leaveBoard = async (boardId: string) => {
    //if (!window.confirm('Вы действительно хотите выйти из этой доски?')) return;
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (boardName) {
      document.title = `Вихід з дошки "${boardName}" | TaskFlow`;
    }

    const result = await swal({
      title: 'Вийти з дошки?',
      text: 'Ви справді хочете покинути цю дошку?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Вийти',
      cancelButtonText: 'Скасувати',
    });

    if (!result.isConfirmed) {
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      }
      return;
    }
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/boards/${boardId}/leave`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success('Ви вийшли з дошки');

      // Перезагружаем список досок
      const res = await axios.get<Board[]>(`${process.env.REACT_APP_API_URL}/api/boards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBoards(res.data);

      // Если мы были на этой доске — переключаемся на первую доступную
      if (activeBoardId === boardId) {
        setActiveBoardId(res.data[0]?._id || null);
      }
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName && res.data[0]?._id != null) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      } else if (res.data[0]?._id == null) {
        document.title = `TaskFlow`;
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Не вдалося вийти');
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      }
    }
  };

  const deleteBoard = async (boardId: string) => {
    //if (!window.confirm('Вы уверены? Доска и ВСЕ задачи будут удалены БЕЗВОЗВРАТНО!')) return;
    const boardName = boards.find(b => b._id === activeBoardId)?.name;
    if (boardName) {
      document.title = `Видалити дошку "${boardName}" | TaskFlow`;
    }

    const result = await swal({
      title: 'Видалити дошку?',
      text: 'Дошка та всі задачі будуть видалені безповоротно!',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Видалити',
      cancelButtonText: 'Скасувати'
    });

    if (!result.isConfirmed) {
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      }
      return;
    }

    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/boards/${boardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success('Дошка видалена');

      const res = await axios.get<Board[]>(`${process.env.REACT_APP_API_URL}/api/boards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBoards(res.data);

      // Переключаемся на первую оставшуюся доску
      setActiveBoardId(res.data[0]?._id || null);
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName && res.data[0]?._id != null) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      } else if (res.data[0]?._id == null) {
        document.title = `TaskFlow`;
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Не вдалося видалити дошку');
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      }
    }
  };

  const fetchArchivedTasks = async () => {
    if (!activeBoardId) {
      setArchivedTasks([]);
      return;
    }

    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/tasks/archive`, {
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
        `${process.env.REACT_APP_API_URL}/api/tasks`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params,   // ← вот это главное!
        }
      );

      const archiveRes = await axios.get<Task[]>(
        `${process.env.REACT_APP_API_URL}/api/tasks/archive`,
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
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
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
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/friends`, {
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
        `${process.env.REACT_APP_API_URL}/api/friends/request`,
        { username },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Запрошення у друзі надіслано!', {
        position: "top-right",
        autoClose: 3000,
        theme: darkMode ? 'dark' : 'light',
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Помилка під час надсилання', {
        position: "top-right",
        theme: darkMode ? 'dark' : 'light',
      });
    }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/friends/${requestId}/accept`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadFriends();
    } catch (err) {
      toast.error('Помилка', {
        position: "top-right",
        theme: darkMode ? 'dark' : 'light',
      });
    }
  };

  const rejectRequest = async (requestId: string) => {
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/friends/${requestId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadFriends();
    } catch (err) {
      toast.error('Помилка', {
        position: "top-right",
        theme: darkMode ? 'dark' : 'light',
      });
    }
  };

  const removeFriend = async (friendId: string) => {
    const result = await swal({
      title: 'Видалити з друзів?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Видалити',
      cancelButtonText: 'Скасувати',
    });
    if (!result.isConfirmed) return;
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/friends/${friendId}/remove`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Друга видалено');
      loadFriends();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Помилка');
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
        `${process.env.REACT_APP_API_URL}/api/auth/change-username`,
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
        `${process.env.REACT_APP_API_URL}/api/auth/change-displayname`,
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
        `${process.env.REACT_APP_API_URL}/api/auth/upload-avatar`,
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
        `${process.env.REACT_APP_API_URL}/api/auth/change-password`,
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
          `${process.env.REACT_APP_API_URL}/api/tasks/${movedTask._id}`,
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
              `${process.env.REACT_APP_API_URL}/api/tasks/${update._id}`,
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
  }, [displayedTasks, parsedFilters]);

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
        await axios.put(`${process.env.REACT_APP_API_URL}/api/tasks/${currentTask._id}`, taskData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${process.env.REACT_APP_API_URL}/api/tasks`, taskData, {
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
    //if (!window.confirm('Переместить задачу в архив?')) return;
    document.title = `Видалення задачі | TaskFlow`;

    const result = await swal({
      title: 'Перемістити в архів?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Перемістити',
      cancelButtonText: 'Скасувати',
    });

    if (!result.isConfirmed) {
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      }
      return;
    }
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/tasks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTasks(); // обновляем основную доску
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      }
    } catch (err) {
      console.error(err);
      const boardName = boards.find(b => b._id === activeBoardId)?.name;
      if (boardName) {
        document.title = `Дошка "${boardName}" | TaskFlow`;
      }
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/tasks/${id}/restore`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTasks();
      fetchArchivedTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const confirmLogout = async () => {
    const result = await swal({
      title: 'Вийти з акаунту?',
      text: 'Вашу сесію буде завершено',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Вийти',
      cancelButtonText: 'Скасувати',
    });

    if (result.isConfirmed) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  };

  const handlePermanentDelete = async (id: string) => {
    //if (!window.confirm('Удалить задачу НАВСЕГДА? Это действие нельзя отменить.')) return;
    const result = await swal({
      title: 'Видалити назавжди?',
      text: 'Цю дію не можна скасувати',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
    });

    if (!result.isConfirmed) return;
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/tasks/${id}/permanent`, {
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

  // ── вспомогательные константы для стилей ──
  const activeBoard = boards.find(b => b._id === activeBoardId);
  const isOwner = activeBoard?.owner?._id === userId;

  const glassCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.13)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: '1rem',
    boxShadow: '0 8px 32px rgba(31,38,135,0.22)',
  };

  const COLUMN_CONFIG = {
    'To Do': { gradient: 'linear-gradient(135deg,#667eea,#764ba2)', icon: faHourglassHalf },
    'In Progress': { gradient: 'linear-gradient(135deg,#f97316,#ef4444)', icon: faFire },
    'Done': { gradient: 'linear-gradient(135deg,#22c55e,#16a34a)', icon: faCircleCheck },
  };

  const getPriorityBadge = (p: string) => {
    if (p === 'High') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.4)', label: '🔴 Високий' };
    if (p === 'Medium') return { bg: 'rgba(249,115,22,0.15)', color: '#f97316', border: 'rgba(249,115,22,0.4)', label: '🟡 Середній' };
    return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'rgba(34,197,94,0.4)', label: '🟢 Низький' };
  };

  return (
    <div style={{
      background: darkMode
        ? 'linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)'
        : 'linear-gradient(135deg,#667eea 0%,#764ba2 40%,#5e60ce 100%)',
      backgroundSize: '200% 200%',
      animation: 'gradientShift 18s ease infinite',
      minHeight: '100vh',
    }}>
      {/* radial overlay */}
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 20% 80%,rgba(255,255,255,0.07) 0%,transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ══════════════ NAVBAR ══════════════ */}
      <nav style={{ ...glassCard, borderRadius: 0, borderBottom: '1px solid rgba(255,255,255,0.18)', position: 'sticky', top: 0, zIndex: 100, padding: '0.6rem 1.5rem' }}>
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">

          {/* Бренд + выбор доски + аватарки участников */}
          <div className="d-flex align-items-center gap-3">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
              <div style={{ width: 40, height: 40, borderRadius: '0.5rem', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0, boxShadow: '0 2px 8px rgba(102,126,234,0.5)' }}>
                <Image src={logo} roundedCircle width={36} height={36} style={{ objectFit: 'cover' }} />
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', letterSpacing: '-0.5px', textShadow: '0 2px 8px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
                TaskFlow
              </span>
            </div>

            {boards.length > 0 && (
              <Dropdown>
                <Dropdown.Toggle id="board-select"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '0.6rem', padding: '0.35rem 0.85rem', fontSize: '0.88rem', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', backdropFilter: 'blur(8px)' }}>
                  <FontAwesomeIcon icon={faLayerGroup} style={{ opacity: 0.7, fontSize: '0.82rem' }} />
                  {activeBoard?.name || 'Оберіть дошку'}
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', fontWeight: 400 }}>
                    {activeBoard ? `${activeBoard.membersCount}/5` : ''}
                  </span>
                </Dropdown.Toggle>
                <Dropdown.Menu style={{ ...glassCard, minWidth: 220, padding: '0.4rem', marginTop: 4 }}>
                  {boards.map(board => (
                    <Dropdown.Item key={board._id} onClick={() => setActiveBoardId(board._id)}
                      style={{ color: 'white', borderRadius: '0.4rem', padding: '0.45rem 0.75rem', fontSize: '0.88rem', background: board._id === activeBoardId ? 'rgba(255,255,255,0.15)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: board._id === activeBoardId ? 700 : 400 }}>{board.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem' }}>{board.membersCount}/5</span>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            )}

            {/* Стэк аватарок участников с онлайн-индикатором */}
            {activeBoard && (activeBoard?.members?.length ?? 0) > 0 && (
              <div className="d-flex align-items-center">
                {activeBoard.members.slice(0, 5).map((m: UserInfo, i: number) => (
                  <div key={m._id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i, position: 'relative' }} title={m.displayName}>
                    {m.avatar ? (
                      <Image src={`${process.env.REACT_APP_API_URL}${m.avatar}`} roundedCircle width={28} height={28} style={{ border: '2px solid rgba(255,255,255,0.5)', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700 }}>
                        {m.displayName[0].toUpperCase()}
                      </div>
                    )}
                    {onlineUsers.has(m._id) && (
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#22c55e', border: '1.5px solid white' }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Поиск */}
          <div className="flex-grow-1" style={{ maxWidth: 420, minWidth: 180 }}>
            <InputGroup>
              <InputGroup.Text style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRight: 'none', color: 'rgba(255,255,255,0.7)' }}>
                <FontAwesomeIcon icon={faSearch} />
              </InputGroup.Text>
              <FormControl
                placeholder="Пошук... (status:done priority:high #tag)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderLeft: 'none', color: 'white', fontSize: '0.85rem' }}
                className="placeholder-white"
              />
              {searchQuery && (
                <Button onClick={() => setSearchQuery('')} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white' }}>×</Button>
              )}
            </InputGroup>
          </div>

          {/* Правая часть */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {/* Фильтр Все / Мои */}
            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '0.5rem', padding: '2px', display: 'flex', border: '1px solid rgba(255,255,255,0.2)' }}>
              {(['all', 'mine'] as const).map(f => (
                <button key={f} onClick={() => setTaskFilter(f)}
                  style={{ background: taskFilter === f ? 'rgba(255,255,255,0.25)' : 'transparent', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '0.4rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                  {f === 'all' ? 'Всі' : 'Мої'}
                </button>
              ))}
            </div>

            {/* Архів */}
            <button onClick={() => { fetchArchivedTasks(); setShowArchiveModal(true); }}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '0.5rem', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}>
              <FontAwesomeIcon icon={faBoxArchive} /> <span className="d-none d-lg-inline">Архів</span>
            </button>

            {/* Статистика */}
            <button onClick={() => { fetchStats(); setShowStatsModal(true); }}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '0.5rem', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}>
              <FontAwesomeIcon icon={faChartBar} /> <span className="d-none d-lg-inline">Статистика</span>
            </button>

            {/* Друзья */}
            <button onClick={() => { loadFriends(); setShowFriendsModal(true); }}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '0.5rem', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}>
              <FontAwesomeIcon icon={faUsers} /> <span className="d-none d-lg-inline">Друзі</span>
            </button>

            {/* Запросити */}
            <button onClick={() => setShowJoinModal(true)}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '0.5rem', padding: '6px 10px', cursor: 'pointer' }}>
              <FontAwesomeIcon icon={faUserPlus} />
            </button>

            {/* Тема */}
            <button onClick={() => setDarkMode(p => !p)}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '0.5rem', padding: '6px 10px', cursor: 'pointer' }}>
              <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
            </button>

            {/* Дропдаун пользователя */}
            <Dropdown align="end">
              <Dropdown.Toggle
                id="user-menu"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '2rem', padding: '4px 12px 4px 4px', color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                {avatar ? (
                  <Image src={`${process.env.REACT_APP_API_URL}${avatar}`} roundedCircle width={28} height={28} style={{ objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)' }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                    {currentDisplayName?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{currentDisplayName}</span>
              </Dropdown.Toggle>

              <Dropdown.Menu style={{ ...glassCard, minWidth: 200, padding: '0.5rem', marginTop: 4 }}>
                <div style={{ padding: '0.5rem 0.75rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.15)', marginBottom: '0.25rem' }}>
                  <div style={{ fontWeight: 700, color: 'white' }}>{currentDisplayName}</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)' }}>@{currentUsername}</div>
                </div>
                <Dropdown.Item onClick={openProfileModal} style={{ color: 'white', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', fontSize: '0.88rem' }}>
                  <FontAwesomeIcon icon={faUser} className="me-2" /> Мій профіль
                </Dropdown.Item>
                <Dropdown.Item onClick={() => setShowNewBoardModal(true)} disabled={boards.length >= 3} style={{ color: 'white', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', fontSize: '0.88rem' }}>
                  <FontAwesomeIcon icon={faPlus} className="me-2" /> Нова дошка {boards.length >= 3 && '(ліміт)'}
                </Dropdown.Item>
                <Dropdown.Divider style={{ borderColor: 'rgba(255,255,255,0.15)' }} />
                {activeBoardId && !isOwner && (
                  <Dropdown.Item onClick={() => activeBoardId && leaveBoard(activeBoardId)} style={{ color: '#fca5a5', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', fontSize: '0.88rem' }}>
                    <FontAwesomeIcon icon={faSignOutAlt} className="me-2" /> Вийти з дошки
                  </Dropdown.Item>
                )}
                {activeBoardId && isOwner && (
                  <Dropdown.Item onClick={() => activeBoardId && deleteBoard(activeBoardId)} style={{ color: '#fca5a5', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', fontSize: '0.88rem' }}>
                    <FontAwesomeIcon icon={faTrash} className="me-2" /> Видалити дошку
                  </Dropdown.Item>
                )}
                <Dropdown.Item onClick={confirmLogout} style={{ color: '#fca5a5', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', fontSize: '0.88rem' }}>
                  <FontAwesomeIcon icon={faSignOutAlt} className="me-2" /> Вийти з акаунту
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
      </nav>

      {/* ══════════════ MAIN ══════════════ */}
      <div style={{ position: 'relative', zIndex: 1, padding: '1.25rem' }}>

        {/* Інфо-бар активної дошки */}
        {activeBoard && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            style={{ ...glassCard, padding: '0.6rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 7px #22c55e', flexShrink: 0 }} />
              <span style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>{activeBoard.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                {activeBoard.membersCount}/{activeBoard.maxMembers} учасників
              </span>
              {activeBoard.owner && (
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  · Власник:&nbsp;
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{activeBoard.owner.displayName}</span>
                  {isOwner && <Badge bg="primary" pill className="ms-1" style={{ fontSize: '0.62rem', verticalAlign: 'middle' }}>ви</Badge>}
                </span>
              )}
              {activeBoard.owner && !isOwner && (
                <button onClick={() => sendFriendRequest(activeBoard.owner!.username)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.65)', borderRadius: '0.4rem', padding: '2px 8px', cursor: 'pointer', fontSize: '0.72rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  + Друг
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.76rem' }}>Задач: {filteredTasks.length}</span>
              {searchQuery && <Badge style={{ background: 'rgba(255,255,255,0.18)', color: 'white', fontSize: '0.7rem', fontWeight: 500 }}>Фільтр активний</Badge>}
            </div>
          </motion.div>
        )}

        {/* Плейсхолдер когда нет досок */}
        {boards.length === 0 && (
          <div style={{ ...glassCard, textAlign: 'center', padding: '4rem 2rem', maxWidth: 440, margin: '4rem auto' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
            <h5 style={{ color: 'white', fontWeight: 700, marginBottom: '0.5rem' }}>Дошок ще немає</h5>
            <p style={{ color: 'rgba(255,255,255,0.55)', marginBottom: '1.5rem' }}>Створіть свою першу дошку щоб почати</p>
            <Button className="reglog-btn" onClick={() => setShowNewBoardModal(true)} style={{ borderRadius: '0.75rem', padding: '0.5rem 2rem' }}>
              <FontAwesomeIcon icon={faPlus} className="me-2" /> Створити дошку
            </Button>
          </div>
        )}

        {/* ══════════════ КАНБАН ══════════════ */}
        {activeBoardId && (
          <DragDropContext onDragEnd={onDragEnd}>
            <Row key={taskFilter} className="g-3">
              {columns.map((col, colIdx) => {
                const conf = COLUMN_CONFIG[col];
                const colTasks = getColumnTasks(col);
                return (
                  <Col key={col} md={4}>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: colIdx * 0.08 }}>
                      <div style={{ ...glassCard, overflow: 'hidden' }}>

                        {/* Заголовок колонки */}
                        <div style={{ background: conf.gradient, padding: '0.7rem 0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', minWidth: 0 }}>
                            <FontAwesomeIcon icon={conf.icon} style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.82rem', flexShrink: 0 }} />
                            <span style={{ color: 'white', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>{col}</span>
                            <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '1rem', padding: '1px 7px', fontSize: '0.73rem', color: 'white', fontWeight: 700, flexShrink: 0 }}>
                              {colTasks.length}
                            </div>
                          </div>
                          <Dropdown align="end">
                            <Dropdown.Toggle id={`sort-${col}`}
                              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '0.4rem', padding: '2px 8px', fontSize: '0.73rem', color: 'white', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {sortOptions[col] === 'default' || !sortOptions[col] ? 'За замовч.' :
                                sortOptions[col] === 'title-asc' ? 'A→Я' :
                                  sortOptions[col] === 'title-desc' ? 'Я→A' :
                                    sortOptions[col] === 'priority-high' ? 'Пріор. ↓' :
                                      sortOptions[col] === 'priority-low' ? 'Пріор. ↑' :
                                        sortOptions[col] === 'deadline-asc' ? 'Дедлайн ↑' :
                                          sortOptions[col] === 'deadline-desc' ? 'Дедлайн ↓' : 'Прострочені'}
                            </Dropdown.Toggle>
                            <Dropdown.Menu style={{ ...glassCard, minWidth: 170, padding: '0.4rem', marginTop: 4 }}>
                              {[
                                { val: 'default', label: 'За замовчуванням' },
                                { val: 'title-asc', label: 'Назва A → Я' },
                                { val: 'title-desc', label: 'Назва Я → A' },
                                { val: 'priority-high', label: 'Пріоритет ↓' },
                                { val: 'priority-low', label: 'Пріоритет ↑' },
                                { val: 'deadline-asc', label: 'Дедлайн ↑' },
                                { val: 'deadline-desc', label: 'Дедлайн ↓' },
                                { val: 'overdue-first', label: 'Прострочені першими' },
                              ].map(opt => (
                                <Dropdown.Item key={opt.val}
                                  onClick={() => setSortOptions(prev => ({ ...prev, [col]: opt.val as SortOption }))}
                                  style={{ color: 'white', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', fontSize: '0.82rem', background: sortOptions[col] === opt.val ? 'rgba(255,255,255,0.15)' : 'transparent', fontWeight: sortOptions[col] === opt.val ? 700 : 400 }}>
                                  {opt.label}
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Menu>
                          </Dropdown>
                        </div>

                        {/* Droppable */}
                        <StrictModeDroppable droppableId={col} key={col} isDropDisabled={false}>
                          {(provided, snapshot) => (
                            <div {...provided.droppableProps} ref={provided.innerRef}
                              style={{ minHeight: 300, padding: '0.75rem', background: snapshot.isDraggingOver ? 'rgba(255,255,255,0.06)' : 'transparent', transition: 'background 0.2s' }}>
                              {colTasks.length === 0 && !snapshot.isDraggingOver && (
                                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'rgba(255,255,255,0.28)', fontSize: '0.82rem' }}>
                                  <div style={{ fontSize: '1.8rem', marginBottom: '0.4rem', opacity: 0.5 }}>📭</div>
                                  Немає задач
                                </div>
                              )}
                              {colTasks.map((task, index) => {
                                const prioBadge = getPriorityBadge(task.priority);
                                const overdue = isOverdue(task.deadline);
                                return (
                                  <Draggable key={task._id} draggableId={task._id} index={index}>
                                    {(provided, snapshot) => (
                                      <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                        style={{ ...provided.draggableProps.style, marginBottom: '0.6rem' }}>
                                        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
                                          style={{
                                            background: snapshot.isDragging ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                                            backdropFilter: 'blur(12px)',
                                            borderRadius: '0.75rem',
                                            border: overdue ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.15)',
                                            boxShadow: snapshot.isDragging ? '0 16px 40px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.12)',
                                            padding: '0.75rem 0.85rem',
                                            cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                                            transform: snapshot.isDragging ? 'rotate(1.5deg)' : undefined,
                                          }}>

                                          {/* Заголовок + кнопки */}
                                          <div className="d-flex justify-content-between align-items-start mb-1">
                                            <h6 style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.35, flex: 1, paddingRight: '0.5rem' }}>
                                              {task.title}
                                            </h6>
                                            <div className="d-flex gap-1 flex-shrink-0">
                                              <button onClick={() => openEditModal(task)}
                                                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '0.35rem', color: 'rgba(255,255,255,0.7)', padding: '3px 7px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                <FontAwesomeIcon icon={faEdit} />
                                              </button>
                                              <button onClick={() => handleDelete(task._id)}
                                                style={{ background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: '0.35rem', color: 'rgba(239,68,68,0.8)', padding: '3px 7px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                <FontAwesomeIcon icon={faTrash} />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Описание */}
                                          {task.description && (
                                            <p style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', lineHeight: 1.4 }}>
                                              {task.description.substring(0, 80)}{task.description.length > 80 ? '…' : ''}
                                            </p>
                                          )}

                                          {/* Метки + теги */}
                                          {((task.labels?.length || 0) > 0 || (task.tags?.length || 0) > 0) && (
                                            <div className="d-flex flex-wrap gap-1 mb-2">
                                              {task.labels?.map(label => (
                                                <span key={label.name} style={{ background: `${label.color}25`, color: label.color, border: `1px solid ${label.color}50`, borderRadius: '1rem', padding: '1px 7px', fontSize: '0.68rem', fontWeight: 600 }}>
                                                  {label.name}
                                                </span>
                                              ))}
                                              {task.tags?.map(tag => (
                                                <span key={tag} style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '1rem', padding: '1px 7px', fontSize: '0.68rem' }}>
                                                  #{tag}
                                                </span>
                                              ))}
                                            </div>
                                          )}

                                          {/* Нижняя строка */}
                                          <div className="d-flex align-items-center justify-content-between" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.45rem', marginTop: '0.25rem' }}>
                                            <div className="d-flex align-items-center gap-2 flex-wrap">
                                              <span style={{ background: prioBadge.bg, color: prioBadge.color, border: `1px solid ${prioBadge.border}`, borderRadius: '1rem', padding: '1px 7px', fontSize: '0.68rem', fontWeight: 600 }}>
                                                {prioBadge.label}
                                              </span>
                                              {task.deadline && (
                                                <span style={{ color: overdue ? '#f87171' : 'rgba(255,255,255,0.45)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                  <FontAwesomeIcon icon={faClock} style={{ fontSize: '0.65rem' }} />
                                                  {new Date(task.deadline).toLocaleDateString('uk-UA')}
                                                  {overdue && <span style={{ color: '#f87171', fontWeight: 700 }}> !</span>}
                                                </span>
                                              )}
                                            </div>
                                            {/* Автор */}
                                            <div className="d-flex align-items-center gap-1">
                                              {task.createdBy?.avatar ? (
                                                <Image src={`${process.env.REACT_APP_API_URL}${task.createdBy.avatar}`} roundedCircle width={20} height={20} style={{ objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.35)', flexShrink: 0 }} />
                                              ) : (
                                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, border: '1.5px solid rgba(255,255,255,0.3)', flexShrink: 0 }}>
                                                  {task.createdBy?.displayName?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                              )}
                                              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {task.createdBy?.displayName || '?'}
                                              </span>
                                              {task.createdBy?._id === userId && (
                                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>· ви</span>
                                              )}
                                            </div>
                                          </div>
                                        </motion.div>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </StrictModeDroppable>

                        {/* Кнопка добавить */}
                        <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <button onClick={() => openAddModal(col)}
                            style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', borderRadius: '0.6rem', padding: '0.45rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <FontAwesomeIcon icon={faPlus} style={{ fontSize: '0.75rem' }} /> Додати картку
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </Col>
                );
              })}
            </Row>
          </DragDropContext>
        )}
      </div>

      {/* ══════════════ МОДАЛКИ ══════════════ */}

      {/* Задача */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton style={glassCard}>
          <Modal.Title style={{ color: 'white', fontWeight: 700 }}>{currentTask ? '✏️ Редагувати картку' : '✨ Нова картка'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ ...glassCard, borderRadius: 0 }}>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label className="fw-medium text-white">Назва</Form.Label>
              <Form.Control value={title} onChange={e => setTitle(e.target.value)} required className="bg-white bg-opacity-25 border-0 text-white placeholder-white" placeholder="Введіть назву..." />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-medium text-white">Опис</Form.Label>
              <Form.Control as="textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} className="bg-white bg-opacity-25 border-0 text-white placeholder-white" placeholder="Необов'язково..." />
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col>
                <Form.Label className="fw-medium text-white">Пріоритет</Form.Label>
                <Form.Select value={priority} onChange={e => setPriority(e.target.value as any)} className="bg-white bg-opacity-25 border-0 text-white">
                  <option value="Low">🟢 Низький</option>
                  <option value="Medium">🟡 Середній</option>
                  <option value="High">🔴 Високий</option>
                </Form.Select>
              </Col>
              <Col>
                <Form.Label className="fw-medium text-white">Дедлайн</Form.Label>
                <Form.Control type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="bg-white bg-opacity-25 border-0 text-white" />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label className="fw-medium text-white">Мітки</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {AVAILABLE_LABELS.map(label => (
                  <span key={label.name} onClick={() => toggleLabel(label)}
                    style={{ background: selectedLabels.some(l => l.name === label.name) ? `${label.color}30` : 'rgba(255,255,255,0.1)', color: label.color, border: `1.5px solid ${selectedLabels.some(l => l.name === label.name) ? label.color : 'rgba(255,255,255,0.2)'}`, borderRadius: '1rem', padding: '3px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                    {label.name}
                  </span>
                ))}
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-medium text-white">Теги</Form.Label>
              <div className="d-flex flex-wrap gap-1 mb-2">
                {tags.map(tag => (
                  <span key={tag} style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '1rem', padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    #{tag} <span onClick={() => removeTag(tag)} style={{ cursor: 'pointer', opacity: 0.6 }}>×</span>
                  </span>
                ))}
              </div>
              <Form.Control type="text" value={tagsInput} onChange={handleTagsChange} placeholder="Введіть тег і натисніть пробіл..." className="bg-white bg-opacity-25 border-0 text-white placeholder-white" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={glassCard}>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Скасувати</Button>
          <Button className="reglog-btn" onClick={handleSave} style={{ border: 'none' }}>Зберегти</Button>
        </Modal.Footer>
      </Modal>

      {/* Профіль */}
      <Modal show={showProfileModal} onHide={() => setShowProfileModal(false)} centered>
        <Modal.Header closeButton style={glassCard}>
          <Modal.Title style={{ color: 'white', fontWeight: 700 }}>👤 Мій профіль</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ ...glassCard, borderRadius: 0, textAlign: 'center', paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
          <div className="mb-3">
            {avatar ? (
              <Image src={`${process.env.REACT_APP_API_URL}${avatar}`} roundedCircle width={100} height={100} style={{ objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)' }} />
            ) : (
              <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: 'white', fontWeight: 700 }}>
                {currentDisplayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <h5 style={{ color: 'white', fontWeight: 700, marginBottom: 2 }}>{currentDisplayName}</h5>
          <div style={{ color: 'rgba(255,255,255,0.55)', marginBottom: '1.5rem', fontSize: '0.88rem' }}>@{currentUsername}</div>
          <div style={{ maxWidth: 260, margin: '0 auto 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
            {[['Логін', currentUsername], ["Ім'я", currentDisplayName], ['Аватарка', avatar ? 'Завантажена ✓' : 'Не встановлена']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{k}</span>
                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.8rem' }}>{v}</span>
              </div>
            ))}
          </div>
          <Button className="reglog-btn w-100 py-2 fw-bold rounded-3 mb-2" style={{ border: 'none' }} onClick={() => { setShowProfileModal(false); navigate('/edit-profile'); }}>
            Змінити дані профілю
          </Button>
          <Button variant="outline-danger" className="w-100" onClick={confirmLogout}>Вийти з акаунту</Button>
        </Modal.Body>
        <Modal.Footer style={glassCard}>
          <Button variant="secondary" onClick={() => setShowProfileModal(false)}>Закрити</Button>
        </Modal.Footer>
      </Modal>

      {/* Архів */}
      <Modal show={showArchiveModal} onHide={() => setShowArchiveModal(false)} size="lg" centered>
        <Modal.Header closeButton style={glassCard}>
          <Modal.Title style={{ color: 'white', fontWeight: 700 }}>📦 Архів — {activeBoard?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ ...glassCard, borderRadius: 0, maxHeight: '60vh', overflowY: 'auto' }}>
          {archivedTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗃️</div>Архів порожній
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {archivedTasks.map(task => (
                <div key={task._id} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.75rem', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{task.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem' }}>
                      Видалено: {task.archivedAt ? new Date(task.archivedAt).toLocaleString('uk-UA') : 'невідомо'}
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button onClick={() => handleRestore(task._id)} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', borderRadius: '0.5rem', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Відновити</button>
                    <button onClick={() => handlePermanentDelete(task._id)} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: '0.5rem', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Видалити</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer style={glassCard}>
          <Button variant="secondary" onClick={() => setShowArchiveModal(false)}>Закрити</Button>
        </Modal.Footer>
      </Modal>

      {/* Статистика */}
      <Modal show={showStatsModal} onHide={() => setShowStatsModal(false)} size="xl" centered>
        <Modal.Header closeButton style={glassCard}>
          <Modal.Title style={{ color: 'white', fontWeight: 700 }}>📊 Статистика — {activeBoard?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ ...glassCard, borderRadius: 0 }}>
          <Row className="g-3 mb-4">
            {[
              { label: 'Всього задач', value: stats.total, color: '#667eea' },
              { label: 'Активних', value: stats.active, color: '#f97316' },
              { label: 'Завершених', value: stats.done, color: '#22c55e' },
              { label: 'Прострочено', value: stats.overdue, color: '#ef4444' },
            ].map(s => (
              <Col md={3} key={s.label}>
                <div style={{ background: `${s.color}18`, border: `1px solid ${s.color}35`, borderRadius: '0.85rem', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
                </div>
              </Col>
            ))}
          </Row>
          <Row className="g-3">
            <Col md={6}>
              <Card style={glassCard}><Card.Body>
                <h6 style={{ color: 'white', textAlign: 'center', marginBottom: '1rem' }}>По статусах</h6>
                <Pie data={{ labels: Object.keys(stats.byStatus), datasets: [{ data: Object.values(stats.byStatus), backgroundColor: ['#667eea', '#f97316', '#22c55e'] }] }} options={{ responsive: true }} />
              </Card.Body></Card>
            </Col>
            <Col md={6}>
              <Card style={glassCard}><Card.Body>
                <h6 style={{ color: 'white', textAlign: 'center', marginBottom: '1rem' }}>По пріоритетах</h6>
                <Bar data={{ labels: ['Low', 'Medium', 'High'], datasets: [{ label: 'Кількість', data: [stats.byPriority?.Low, stats.byPriority?.Medium, stats.byPriority?.High], backgroundColor: ['#22c55e', '#f97316', '#ef4444'] }] }} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
              </Card.Body></Card>
            </Col>
          </Row>
          <Row className="mt-3 g-3">
            <Col md={6}>
              <Card style={glassCard}><Card.Body>
                <h6 style={{ color: 'white', marginBottom: '0.75rem' }}>Топ-5 міток</h6>
                {stats.topLabels?.length > 0 ? stats.topLabels.map((i: any, idx: number) => (
                  <div key={idx} className="d-flex justify-content-between mb-2" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
                    <span>{i.name}</span><Badge bg="primary">{i.count}</Badge>
                  </div>
                )) : <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Немає міток</p>}
              </Card.Body></Card>
            </Col>
            <Col md={6}>
              <Card style={glassCard}><Card.Body>
                <h6 style={{ color: 'white', marginBottom: '0.75rem' }}>Топ-5 тегів</h6>
                {stats.topTags?.length > 0 ? stats.topTags.map((i: any, idx: number) => (
                  <div key={idx} className="d-flex justify-content-between mb-2" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
                    <span>#{i.name}</span><Badge bg="secondary">{i.count}</Badge>
                  </div>
                )) : <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Немає тегів</p>}
              </Card.Body></Card>
            </Col>
          </Row>
          {stats.recentOverdue?.length > 0 && (
            <Card className="mt-3" style={glassCard}><Card.Body>
              <h6 style={{ color: 'white', marginBottom: '0.75rem' }}>⚠️ Прострочені задачі</h6>
              {stats.recentOverdue.map((task: Task) => (
                <div key={task._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>{task.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem' }}>Дедлайн: {new Date(task.deadline!).toLocaleDateString('uk-UA')}</div>
                  </div>
                  <Badge bg="danger">Прострочено</Badge>
                </div>
              ))}
            </Card.Body></Card>
          )}
        </Modal.Body>
        <Modal.Footer style={glassCard}>
          <Button variant="secondary" onClick={() => setShowStatsModal(false)}>Закрити</Button>
        </Modal.Footer>
      </Modal>

      {/* Нова дошка */}
      <Modal show={showNewBoardModal} onHide={() => setShowNewBoardModal(false)} centered>
        <Modal.Header closeButton style={glassCard}>
          <Modal.Title style={{ color: 'white', fontWeight: 700 }}>📋 Нова дошка</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ ...glassCard, borderRadius: 0 }}>
          <Form.Group>
            <Form.Label className="fw-medium text-white">Назва дошки <span className="text-danger">*</span></Form.Label>
            <Form.Control type="text" value={newBoardName} onChange={e => setNewBoardName(e.target.value)} placeholder="Моя нова дошка" className="bg-white bg-opacity-25 border-0 text-white placeholder-white" />
            <Form.Text style={{ color: 'rgba(255,255,255,0.4)' }}>Залишилось слотів: {3 - boards.length}</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer style={glassCard}>
          <Button variant="secondary" onClick={() => setShowNewBoardModal(false)}>Скасувати</Button>
          <Button className="reglog-btn" disabled={!newBoardName.trim()} style={{ border: 'none' }}
            onClick={async () => {
              try {
                await axios.post(`${process.env.REACT_APP_API_URL}/api/boards`, { name: newBoardName.trim() }, { headers: { Authorization: `Bearer ${token}` } });
                const boardsRes = await axios.get<Board[]>(`${process.env.REACT_APP_API_URL}/api/boards`, { headers: { Authorization: `Bearer ${token}` } });
                setBoards(boardsRes.data);
                const newBoard = boardsRes.data.find(b => b.name === newBoardName.trim());
                if (newBoard) { setActiveBoardId(newBoard._id); setInviteCode(newBoard.inviteCode || null); }
                setNewBoardName(''); setShowNewBoardModal(false); toast.success('Дошку створено!');
              } catch (err: any) { toast.error(err.response?.data?.message || 'Помилка створення'); }
            }}>
            Створити
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Запрошення */}
      <Modal show={showJoinModal} onHide={() => setShowJoinModal(false)} centered>
        <Modal.Header closeButton style={glassCard}>
          <Modal.Title style={{ color: 'white', fontWeight: 700 }}>🔗 Запросити на дошку</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ ...glassCard, borderRadius: 0 }}>
          {activeBoardId && boards.length > 0 ? (
            <div className="mb-4">
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Код запрошення для поточної дошки:</p>
              {inviteCode ? (
                <>
                  <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0.75rem', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '0.15em' }}>{inviteCode}</span>
                    <button onClick={() => { navigator.clipboard.writeText(inviteCode); toast.success('Скопійовано!'); }}
                      className="theme-btn-copy"
                      style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '0.5rem', padding: '4px 10px', color: 'white', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <FontAwesomeIcon icon={faCopy} /> Копіювати
                    </button>
                  </div>
                  {(() => {
                    const cb = boards.find(b => b._id === activeBoardId);
                    if (!cb) return null;
                    const rem = cb.maxMembers - cb.membersCount;
                    return <div style={{ marginTop: '0.5rem', color: rem === 0 ? '#f87171' : '#4ade80', fontSize: '0.82rem', fontWeight: 600 }}>Вільних місць: {rem} з {cb.maxMembers}{rem === 0 && ' (дошка заповнена)'}</div>;
                  })()}
                  {boards.find(b => b._id === activeBoardId)?.inviteUsed && (
                    <Alert variant="warning" className="mt-2" style={{ fontSize: '0.82rem' }}>Цей код вже використано</Alert>
                  )}
                </>
              ) : <p style={{ color: 'rgba(255,255,255,0.4)' }}>Код ще не згенеровано</p>}
            </div>
          ) : <p style={{ color: 'rgba(255,255,255,0.4)' }}>Спочатку оберіть дошку</p>}
          <hr style={{ borderColor: 'rgba(255,255,255,0.15)' }} />
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>У мене є код запрошення:</p>
          <Form.Control type="text" placeholder="Введіть код" value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())} className="bg-white bg-opacity-25 border-0 text-white placeholder-white" />
          {joinError && <Alert variant="danger" className="mt-2">{joinError}</Alert>}
        </Modal.Body>
        <Modal.Footer style={glassCard}>
          <Button variant="secondary" onClick={() => setShowJoinModal(false)}>Закрити</Button>
          <Button className="reglog-btn" disabled={!joinCodeInput.trim()} style={{ border: 'none' }}
            onClick={async () => {
              try {
                const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/boards/join`, { inviteCode: joinCodeInput.trim() }, { headers: { Authorization: `Bearer ${token}` } });
                setBoards(prev => [...prev, res.data]); setActiveBoardId(res.data._id); setTasks([]); fetchTasks();
                setJoinCodeInput(''); setJoinError(''); setShowJoinModal(false);
                toast.success('Ви успішно приєдналися до дошки!');
              } catch (err: any) { setJoinError(err.response?.data?.message || 'Помилка приєднання'); }
            }}>
            Приєднатися
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Друзі */}
      <Modal show={showFriendsModal} onHide={() => setShowFriendsModal(false)} size="lg" centered>
        <Modal.Header closeButton style={glassCard}>
          <Modal.Title style={{ color: 'white', fontWeight: 700 }}>👥 Друзі</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ ...glassCard, borderRadius: 0 }}>
          <div className="mb-4">
            <InputGroup>
              <FormControl placeholder="Введіть логін користувача..." value={friendUsernameInput || ''} onChange={e => setFriendUsernameInput(e.target.value.trim())} className="bg-white bg-opacity-25 border-0 text-white placeholder-white" />
              <Button className="reglog-btn" disabled={!friendUsernameInput?.trim()} style={{ border: 'none' }}
                onClick={async () => {
                  if (!friendUsernameInput?.trim()) return;
                  try { await sendFriendRequest(friendUsernameInput.trim()); setFriendUsernameInput(''); loadFriends(); } catch { }
                }}>
                Додати в друзі
              </Button>
            </InputGroup>
          </div>

          <div className="d-flex mb-3 gap-1">
            {(['friends', 'incoming', 'outgoing'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveFriendsTab(tab)}
                className="theme-btn-tab"
                style={{ flex: 1, background: activeFriendsTab === tab ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', borderRadius: '0.5rem', padding: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                {tab === 'friends' && `Мої друзі (${friendsData.friends.length})`}
                {tab === 'incoming' && `Вхідні (${friendsData.incoming.length})`}
                {tab === 'outgoing' && `Надіслані (${friendsData.outgoing.length})`}
              </button>
            ))}
          </div>

          {activeFriendsTab === 'friends' && (friendsData.friends.length === 0
            ? <p style={{ textAlign:'center', color:'rgba(255,255,255,0.35)', padding:'2rem' }}>Ще немає друзів</p>
            : friendsData.friends.map(f => (
              <div key={f._id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.6rem 0', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {f.avatar
                    ? <Image src={`${process.env.REACT_APP_API_URL}${f.avatar}`} roundedCircle width={42} height={42} style={{ objectFit:'cover' }} />
                    : <div style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, color:'white', fontWeight:700 }}>{f.displayName[0]}</div>
                  }
                  <div>
                    <div style={{ color:'white', fontWeight:700, fontSize:'0.9rem' }}>{f.displayName}</div>
                    <div style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.78rem' }}>@{f.username}</div>
                  </div>
                </div>
                <button onClick={() => removeFriend(f._id)}
                  style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:'0.4rem', padding:'4px 10px', cursor:'pointer', fontSize:'0.8rem', fontWeight:600, flexShrink:0 }}>
                  Видалити
                </button>
              </div>
            ))
          )}

          {activeFriendsTab === 'incoming' && (friendsData.incoming.length === 0
            ? <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '2rem' }}>Немає вхідних запитів</p>
            : friendsData.incoming.map(req => (
              <div key={req.requestId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {req.from?.avatar && <Image src={`${process.env.REACT_APP_API_URL}${req.from.avatar}`} roundedCircle width={38} height={38} />}
                  <div style={{ color: 'white', fontWeight: 600, fontSize: '0.88rem' }}>{req.from?.displayName} <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>@{req.from?.username}</span></div>
                </div>
                <div className="d-flex gap-2">
                  <button onClick={() => acceptRequest(req.requestId)} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', borderRadius: '0.4rem', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Прийняти</button>
                  <button onClick={() => rejectRequest(req.requestId)} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '0.4rem', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Відхилити</button>
                </div>
              </div>
            ))
          )}

          {activeFriendsTab === 'outgoing' && (friendsData.outgoing.length === 0
            ? <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '2rem' }}>Немає надісланих запитів</p>
            : friendsData.outgoing.map(req => (
              <div key={req.requestId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {req.to?.avatar && <Image src={`${process.env.REACT_APP_API_URL}${req.to.avatar}`} roundedCircle width={38} height={38} />}
                  <div style={{ color: 'white', fontWeight: 600, fontSize: '0.88rem' }}>{req.to?.displayName} <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>@{req.to?.username}</span></div>
                </div>
                <button onClick={() => rejectRequest(req.requestId)} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '0.4rem', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Скасувати</button>
              </div>
            ))
          )}
        </Modal.Body>
        <Modal.Footer style={glassCard}>
          <Button variant="secondary" onClick={() => setShowFriendsModal(false)}>Закрити</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default TaskList;
