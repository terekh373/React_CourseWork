import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button, Alert, InputGroup } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { FaUser, FaLock } from 'react-icons/fa';

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

  useEffect(() => {
    document.title = 'Вхід | TaskFlow';
    return () => { document.title = 'TaskFlow'; }; // сброс при уходе со страницы
  }, []);

  return (
    <div
      className="min-vh-100 d-flex align-items-center"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 40%, #5e60ce 100%)',
        backgroundSize: '200% 200%',
        animation: 'gradientShift 18s ease infinite',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Лёгкий оверлей для глубины */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.12) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <Container className="position-relative z-1">
        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={8} lg={5}>
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <Card
                className="border-0 rounded-4 overflow-hidden shadow-2xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.18)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37)',
                }}
              >
                <Card.Body className="p-5 p-md-5">
                  <div className="text-center mb-5">
                    <h2 className="fw-bold text-white mb-1">Вітаємо!</h2>
                    <p className="text-white-75">Увійдіть до свого TaskManager</p>
                  </div>

                  {error && <Alert variant="danger" className="rounded-3">{error}</Alert>}

                  <Form onSubmit={handleSubmit}>
                    <Form.Group className="mb-4">
                      <Form.Label className="fw-medium text-white">Логін</Form.Label>
                      <InputGroup>
                        <InputGroup.Text className="bg-white bg-opacity-25 border-0"><FaUser className="text-white" /></InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="Введіть ваш логін"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          required
                          className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                        />
                      </InputGroup>
                    </Form.Group>

                    <Form.Group className="mb-4">
                      <Form.Label className="fw-medium text-white">Пароль</Form.Label>
                      <InputGroup>
                        <InputGroup.Text className="bg-white bg-opacity-25 border-0"><FaLock className="text-white" /></InputGroup.Text>
                        <Form.Control
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                        />
                      </InputGroup>
                    </Form.Group>

                    <Button
                      type="submit"
                      className="reglog-btn w-100 py-3 fw-bold rounded-3"
                      size="lg"
                    >
                      Увійти
                    </Button>
                  </Form>

                  <div className="text-center mt-4">
                    <p className="mb-2 text-white">
                      Немає акаунту?{' '}
                      <Link to="/register" className="text-white fw-bold text-decoration-none">
                        Зареєструватися
                      </Link>
                    </p>
                    <Link
                      to="/forgot-password"
                      className="text-white-75 small text-decoration-none hover-text-white"
                    >
                      Забули пароль?
                    </Link>
                  </div>
                </Card.Body>
              </Card>
            </motion.div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Login;