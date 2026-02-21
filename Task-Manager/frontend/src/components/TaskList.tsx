import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import {
  Container, Row, Col, Card, Button, Modal, Form, Badge,
  InputGroup, FormControl, Alert
} from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faSearch, faClock, faSun, faMoon,
  faExclamationTriangle, faCheckCircle, faUser
} from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';

interface Task {
  _id: string;
  title: string;
  description?: string;
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  deadline?: string;
  order?: number;
}

interface TaskListProps {
  token: string;
}

const columns = ['To Do', 'In Progress', 'Done'] as const;

const TaskList: React.FC<TaskListProps> = ({ token }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [deadline, setDeadline] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<'To Do' | 'In Progress' | 'Done'>('To Do');

  // Стани для профілю
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/tasks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTasks(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadUserInfo = useCallback(async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCurrentUsername(res.data.username);
      setNewUsername(res.data.username);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const openProfileModal = () => {
    loadUserInfo();
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
      const res = await axios.put('http://localhost:5000/api/auth/change-username',
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

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setProfileError('Нові паролі не співпадають');
      return;
    }
    try {
      await axios.put('http://localhost:5000/api/auth/change-password',
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

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination } = result;

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const movedTask = tasks.find(t => t._id === result.draggableId);
    if (!movedTask) return;

    const newStatus = destination.droppableId as Task['status'];

    try {
      await axios.put(`http://localhost:5000/api/tasks/${movedTask._id}`,
        { ...movedTask, status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
  );

  const getColumnTasks = (col: string) => filteredTasks.filter(t => t.status === col);

  const openAddModal = (col: 'To Do' | 'In Progress' | 'Done') => {
    setSelectedColumn(col);
    setCurrentTask(null);
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setDeadline('');
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setCurrentTask(task);
    setTitle(task.title);
    setDescription(task.description || '');
    setPriority(task.priority);
    setDeadline(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const taskData = {
        title,
        description,
        priority,
        deadline: deadline || undefined,
        status: currentTask ? currentTask.status : selectedColumn
      };

      if (currentTask) {
        await axios.put(`http://localhost:5000/api/tasks/${currentTask._id}`, taskData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('http://localhost:5000/api/tasks', taskData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      fetchTasks();
      setShowModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Видалити?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/tasks/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
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
        {/* Верхня панель */}
        <Row className="align-items-center mb-4">
          <Col>
            <h1 className="fw-bold">Kanban Дошка</h1>
          </Col>
          <Col xs="auto" className="d-flex align-items-center gap-3">
            <Button
              variant={darkMode ? 'outline-light' : 'outline-secondary'}
              onClick={() => setDarkMode(!darkMode)}
            >
              <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
            </Button>

            <InputGroup style={{ width: '250px' }}>
              <InputGroup.Text><FontAwesomeIcon icon={faSearch} /></InputGroup.Text>
              <FormControl
                placeholder="Пошук..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </InputGroup>

            {/* Кнопка Аккаунт */}
            <Button
              variant="outline-primary"
              onClick={openProfileModal}
            >
              <FontAwesomeIcon icon={faUser} className="me-1" /> Аккаунт
            </Button>
          </Col>
        </Row>

        {/* Kanban дошка */}
        <DragDropContext onDragEnd={onDragEnd}>
          <Row className="g-4">
            {columns.map(col => (
              <Col key={col} md={4}>
                <Card className="h-100 shadow-sm" bg={darkMode ? 'dark' : 'white'}>
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">{col}</h5>
                    <Badge bg={col === 'Done' ? 'success' : col === 'In Progress' ? 'primary' : 'secondary'}>
                      {getColumnTasks(col).length}
                    </Badge>
                  </Card.Header>
                  <Droppable droppableId={col}>
                    {(provided) => (
                      <Card.Body
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        style={{ minHeight: '300px' }}
                      >
                        {getColumnTasks(col).map((task, index) => (
                          <Draggable key={task._id} draggableId={task._id} index={index}>
                            {(provided) => (
                              <motion.div
                                ref={provided.innerRef}
                                {...(provided.draggableProps as any)}
                                {...(provided.dragHandleProps as any)}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-3"
                              >
                                <Card
                                  style={{ ...getPriorityStyle(task.priority), cursor: 'grab' }}
                                  className="shadow-sm"
                                  bg={darkMode ? 'secondary' : 'white'}
                                >
                                  <Card.Body>
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
                                    {task.description && <p className="small text-muted mb-2">{task.description.substring(0, 80)}{task.description.length > 80 ? '...' : ''}</p>}
                                    <div className="d-flex justify-content-between align-items-center small">
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
                                  </Card.Body>
                                </Card>
                              </motion.div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </Card.Body>
                    )}
                  </Droppable>
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

      {/* Модалка для завдань */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{currentTask ? 'Редагувати картку' : 'Нова картка'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Назва</Form.Label>
              <Form.Control value={title} onChange={e => setTitle(e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Опис</Form.Label>
              <Form.Control as="textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пріоритет</Form.Label>
              <Form.Select value={priority} onChange={e => setPriority(e.target.value as any)}>
                <option value="Low">Низький</option>
                <option value="Medium">Середній</option>
                <option value="High">Високий</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Дедлайн</Form.Label>
              <Form.Control type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Скасувати</Button>
          <Button variant="primary" onClick={handleSave}>Зберегти</Button>
        </Modal.Footer>
      </Modal>

      {/* Модалка профілю (Аккаунт) */}
      {/* Модалка профілю (Аккаунт) */}
      <Modal
        show={showProfileModal}
        onHide={() => setShowProfileModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Мій аккаунт</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {profileError && <Alert variant="danger">{profileError}</Alert>}
          {profileSuccess && <Alert variant="success">{profileSuccess}</Alert>}

          <h6 className="mb-3">Поточний логін: <strong>{currentUsername}</strong></h6>

          <Form.Group className="mb-4">
            <Form.Label>Новий логін</Form.Label>
            <Form.Control
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
            />
            <Button
              variant="primary"
              size="sm"
              className="mt-2"
              onClick={handleChangeUsername}
            >
              Змінити логін
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

          <Button
            variant="primary"
            className="w-100 mb-3"
            onClick={handleChangePassword}
          >
            Змінити пароль
          </Button>

          {/* Кнопка Вийти з аккаунту */}
          <Button
            variant="outline-danger"
            className="w-100"
            onClick={() => {
              if (window.confirm('Ви дійсно хочете вийти з аккаунту?')) {
                localStorage.removeItem('token');
                window.location.href = '/login';  // або useNavigate('/login') якщо є useNavigate
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
    </div>
  );
};

export default TaskList;