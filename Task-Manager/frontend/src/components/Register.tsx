import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Container, Alert } from 'react-bootstrap';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');  // Новое поле
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await axios.post('http://localhost:5000/api/auth/register', { username, displayName, password });
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка регистрации');
    }
  };

  return (
    <Container className="mt-5" style={{ maxWidth: '400px' }}>
      <h2 className="text-center mb-4">Регистрация</h2>

      {error && <Alert variant="danger">{error}</Alert>}

      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Label>Логин</Form.Label>
          <Form.Control 
            type="text" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Ник (отображаемое имя)</Form.Label>
          <Form.Control 
            type="text" 
            value={displayName} 
            onChange={e => setDisplayName(e.target.value)} 
            required 
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Пароль</Form.Label>
          <Form.Control 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
        </Form.Group>

        <Button variant="primary" type="submit" className="w-100 mb-3">
          Зарегистрироваться
        </Button>
      </Form>

      <div className="text-center">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="text-primary fw-bold">
          Войти
        </Link>
      </div>
    </Container>
  );
};

export default Register;