import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button, Alert } from 'react-bootstrap';
import { motion } from 'framer-motion';

interface LoginProps {
  setToken: (token: string) => void;
}

const Login: React.FC<LoginProps> = ({ setToken }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/api/auth/login', { username, password });
      setToken(res.data.token);
      navigate('/tasks');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка входу');
    }
  };

  return (
    <Container fluid className="vh-100 d-flex align-items-center justify-content-center bg-gradient" 
      style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <Card style={{ width: '400px', border: 'none', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          <Card.Body className="p-5">
            <h2 className="text-center mb-4 text-primary fw-bold">Вхід</h2>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-4">
                <Form.Label>Ім'я користувача</Form.Label>
                <Form.Control type="text" value={username} onChange={e => setUsername(e.target.value)} required />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Пароль</Form.Label>
                <Form.Control type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </Form.Group>
              <Button variant="primary" type="submit" className="w-100 py-2 fw-bold">Увійти</Button>
            </Form>
            <div className="text-center mt-4">
              Немає акаунту? <Link to="/register" className="text-primary fw-bold">Зареєструватися</Link>
            </div>
          </Card.Body>
        </Card>
      </motion.div>
    </Container>
  );
};

export default Login;