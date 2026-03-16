import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Container, Alert, ListGroup, ProgressBar, InputGroup } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { FaUser, FaLock, FaQuestionCircle, FaKey } from 'react-icons/fa';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const navigate = useNavigate();

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push('Мінімум 8 символів');
    if (!/[A-Z]/.test(pwd)) errors.push('Одна велика літера');
    if (!/[a-z]/.test(pwd)) errors.push('Одна мала літера');
    if (!/[0-9]/.test(pwd)) errors.push('Одна цифра');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd)) errors.push('Спеціальний символ');
    return errors;
  };

  const getPasswordStrength = () => {
    const errors = validatePassword(password);
    if (password.length === 0) return { variant: 'danger', label: '', value: 0 };
    if (errors.length === 0) return { variant: 'success', label: 'Дуже сильний', value: 100 };
    if (errors.length <= 2) return { variant: 'warning', label: 'Середній', value: 60 };
    return { variant: 'danger', label: 'Слабкий', value: 30 };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pwdErrors = validatePassword(password);
    setPasswordErrors(pwdErrors);

    if (pwdErrors.length > 0) return;

    try {
      await axios.post('http://localhost:5000/api/auth/register', {
        username,
        displayName,
        password,
        securityQuestion,
        securityAnswer,
      });
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка реєстрації');
    }
  };

  useEffect(() => {
    document.title = 'Реєстрація | TaskFlow';
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <Container className="position-relative z-1">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <div
                className="card border-0 rounded-4 overflow-hidden shadow-2xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.18)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37)',
                }}
              >
                <div className="card-body p-5 p-md-5">
                  <h2 className="text-center fw-bold text-white mb-4">Створити акаунт</h2>

                  {error && <Alert variant="danger" className="rounded-3">{error}</Alert>}

                  <Form onSubmit={handleSubmit}>
                    <Form.Group className="mb-4">
                      <Form.Label className="fw-medium text-white">Логін</Form.Label>
                      <InputGroup>
                        <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                          <FaUser className="text-white" />
                        </InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="Ваш унікальний логін"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          required
                          className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                        />
                      </InputGroup>
                    </Form.Group>

                    <Form.Group className="mb-4">
                      <Form.Label className="fw-medium text-white">Відображуване ім'я</Form.Label>
                      <InputGroup>
                        <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                          <FaUser className="text-white" />
                        </InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="Як вас бачитимуть інші"
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          required
                          className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                        />
                      </InputGroup>
                    </Form.Group>

                    <Form.Group className="mb-4">
                      <Form.Label className="fw-medium text-white">Пароль</Form.Label>
                      <InputGroup>
                        <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                          <FaLock className="text-white" />
                        </InputGroup.Text>
                        <Form.Control
                          type="password"
                          placeholder="Створіть надійний пароль"
                          value={password}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPassword(val);
                            setPasswordErrors(validatePassword(val));
                          }}
                          isInvalid={passwordErrors.length > 0 && password.length > 0}
                          required
                          className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                        />
                      </InputGroup>

                      {password.length > 0 && (
                        <div className="mt-2">
                          <ProgressBar
                            variant={strength.variant}
                            now={strength.value}
                            className="mb-1 rounded-pill"
                            style={{ height: '8px' }}
                          />
                          <small className={`d-block text-${strength.variant}`}>
                            {strength.label}
                          </small>
                        </div>
                      )}

                      {passwordErrors.length > 0 && (
                        <ListGroup variant="flush" className="mt-2 small text-danger">
                          {passwordErrors.map((err, idx) => (
                            <ListGroup.Item key={idx} className="border-0 p-1 text-danger bg-transparent">
                              • {err}
                            </ListGroup.Item>
                          ))}
                        </ListGroup>
                      )}
                    </Form.Group>

                    <Form.Group className="mb-4">
                      <Form.Label className="fw-medium text-white">Секретне питання</Form.Label>
                      <InputGroup>
                        <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                          <FaQuestionCircle className="text-white" />
                        </InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="Наприклад: Улюблена іграшка дитинства?"
                          value={securityQuestion}
                          onChange={e => setSecurityQuestion(e.target.value)}
                          required
                          className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                        />
                      </InputGroup>
                    </Form.Group>

                    <Form.Group className="mb-4">
                      <Form.Label className="fw-medium text-white">Відповідь</Form.Label>
                      <InputGroup>
                        <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                          <FaKey className="text-white" />
                        </InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="Ваша відповідь"
                          value={securityAnswer}
                          onChange={e => setSecurityAnswer(e.target.value)}
                          required
                          className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                        />
                      </InputGroup>
                    </Form.Group>

                    <Button
                      type="submit"
                      className="reglog-btn w-100 py-3 fw-bold rounded-3"
                      size="lg"
                      disabled={passwordErrors.length > 0}
                    >
                      Зареєструватися
                    </Button>
                  </Form>

                  <div className="text-center mt-4">
                    Вже є акаунт?{' '}
                    <Link to="/login" className="text-white fw-bold text-decoration-none">
                      Увійти
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default Register;