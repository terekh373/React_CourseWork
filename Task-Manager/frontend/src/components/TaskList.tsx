import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Button, Form, Modal, Container, Row, Col } from 'react-bootstrap';

interface Task {
  _id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  deadline: Date | null;
}

const TaskList: React.FC<{ token: string }> = ({ token }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('To Do');
  const [priority, setPriority] = useState('Medium');
  const [deadline, setDeadline] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    const res = await axios.get('http://localhost:5000/api/tasks', { headers: { Authorization: `Bearer ${token}` } });
    setTasks(res.data);
  };

  const handleSave = async () => {
    const taskData = { title, description, status, priority, deadline: deadline || null };
    if (currentTask) {
      await axios.put(`http://localhost:5000/api/tasks/${currentTask._id}`, taskData, { headers: { Authorization: `Bearer ${token}` } });
    } else {
      await axios.post('http://localhost:5000/api/tasks', taskData, { headers: { Authorization: `Bearer ${token}` } });
    }
    fetchTasks();
    setShowModal(false);
  };

  const handleEdit = (task: Task) => {
    setCurrentTask(task);
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setPriority(task.priority);
    setDeadline(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    await axios.delete(`http://localhost:5000/api/tasks/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    fetchTasks();
  };

  const filteredTasks = tasks
    .filter(task => task.title.toLowerCase().includes(search.toLowerCase()) || task.description.toLowerCase().includes(search.toLowerCase()))
    .filter(task => !filterStatus || task.status === filterStatus)
    .sort((a, b) => sortBy === 'deadline' ? (a.deadline?.getTime() || 0) - (b.deadline?.getTime() || 0) : 0);  // Приклад сортування

  // Статистика
  const stats = {
    todo: tasks.filter(t => t.status === 'To Do').length,
    inProgress: tasks.filter(t => t.status === 'In Progress').length,
    done: tasks.filter(t => t.status === 'Done').length,
  };

  return (
    <Container>
      <h1>Task Manager</h1>
      <Row>
        <Col><p>To Do: {stats.todo}</p></Col>
        <Col><p>In Progress: {stats.inProgress}</p></Col>
        <Col><p>Done: {stats.done}</p></Col>
      </Row>
      <Form.Control type="text" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
      <Form.Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
        <option value="">All Statuses</option>
        <option>To Do</option>
        <option>In Progress</option>
        <option>Done</option>
      </Form.Select>
      <Form.Select value={sortBy} onChange={e => setSortBy(e.target.value)}>
        <option value="createdAt">Sort by Creation</option>
        <option value="deadline">Sort by Deadline</option>
      </Form.Select>
      <Button onClick={() => { setCurrentTask(null); setShowModal(true); }}>Add Task</Button>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Title</th>
            <th>Description</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Deadline</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredTasks.map(task => (
            <tr key={task._id}>
              <td>{task.title}</td>
              <td>{task.description}</td>
              <td>{task.status}</td>
              <td>{task.priority}</td>
              <td>{task.deadline ? new Date(task.deadline).toLocaleDateString() : 'None'}</td>
              <td>
                <Button variant="info" onClick={() => handleEdit(task)}>Edit</Button>
                <Button variant="danger" onClick={() => handleDelete(task._id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{currentTask ? 'Edit Task' : 'Add Task'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group>
              <Form.Label>Title</Form.Label>
              <Form.Control type="text" value={title} onChange={e => setTitle(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" value={description} onChange={e => setDescription(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Status</Form.Label>
              <Form.Select value={status} onChange={e => setStatus(e.target.value)}>
                <option>To Do</option>
                <option>In Progress</option>
                <option>Done</option>
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Priority</Form.Label>
              <Form.Select value={priority} onChange={e => setPriority(e.target.value)}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Deadline</Form.Label>
              <Form.Control type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Close</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default TaskList;