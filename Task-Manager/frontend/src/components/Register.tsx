import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';   // ← додай Link
import { Form, Button, Container, Alert } from 'react-bootstrap';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await axios.post('http://localhost:5000/api/auth/register', { username, password });
      navigate('/login');  // після успішної реєстрації → на логін
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка реєстрації');
    }
  };

  return (
    <Container className="mt-5" style={{ maxWidth: '400px' }}>
      <h2 className="text-center mb-4">Реєстрація</h2>

      {error && <Alert variant="danger">{error}</Alert>}

      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Label>Ім'я користувача</Form.Label>
          <Form.Control 
            type="text" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
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
          Зареєструватися
        </Button>
      </Form>

      {/* Додаємо посилання на логін */}
      <div className="text-center">
        Вже маєте акаунт?{' '}
        <Link to="/login" className="text-primary fw-bold">
          Увійти
        </Link>
      </div>
    </Container>
  );
};

export default Register;