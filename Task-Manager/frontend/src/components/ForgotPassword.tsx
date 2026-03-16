import { useState, useEffect, FormEvent } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Container, Alert, ListGroup, ProgressBar, InputGroup } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { FaUser, FaQuestionCircle, FaLock, FaKey } from 'react-icons/fa';

const ForgotPassword = () => {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    const errors = validatePassword(newPassword);
    if (newPassword.length === 0) return { variant: 'danger', label: '', value: 0 };
    if (errors.length === 0) return { variant: 'success', label: 'Дуже сильний', value: 100 };
    if (errors.length <= 2) return { variant: 'warning', label: 'Середній', value: 60 };
    return { variant: 'danger', label: 'Слабкий', value: 30 };
  };

  const strength = getPasswordStrength();

  const handleGetQuestion = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/auth/forgot-password/question`, { username });
      setQuestion(res.data.question);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка');
    }
  };

  const handleVerifyAnswer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const pwdErrors = validatePassword(newPassword);
    setPasswordErrors(pwdErrors);

    if (pwdErrors.length > 0) return;

    if (newPassword !== confirmPassword) {
      setError('Паролі не співпадають');
      return;
    }

    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/auth/forgot-password/reset`, {
        username,
        answer,
        newPassword,
      });
      setSuccess('Пароль змінено! Тепер можете увійти.');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Невірна відповідь або помилка');
    }
  };

  useEffect(() => {
    document.title = 'Відновлення пароля | TaskFlow';
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
          background: 'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.12) 0%, transparent 60%)',
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
                  <h2 className="text-center fw-bold text-white mb-4">Відновлення пароля</h2>

                  {error && <Alert variant="danger" className="rounded-3">{error}</Alert>}
                  {success && <Alert variant="success" className="rounded-3">{success}</Alert>}

                  {step === 1 && (
                    <Form onSubmit={handleGetQuestion}>
                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-white">Логін (username)</Form.Label>
                        <InputGroup>
                          <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                            <FaUser className="text-white" />
                          </InputGroup.Text>
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
                      <Button variant="primary" type="submit" className="w-100 py-3 fw-bold rounded-3 shadow-sm">
                        Продовжити
                      </Button>
                    </Form>
                  )}

                  {step === 2 && (
                    <Form onSubmit={handleVerifyAnswer}>
                      <div className="mb-4 p-3 bg-white bg-opacity-10 rounded-3 text-white">
                        <strong>Секретне питання:</strong><br />
                        <span className="fw-medium">{question}</span>
                      </div>

                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-white">Ваша відповідь</Form.Label>
                        <InputGroup>
                          <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                            <FaKey className="text-white" />
                          </InputGroup.Text>
                          <Form.Control
                            type="text"
                            placeholder="Введіть відповідь"
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            required
                            className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                          />
                        </InputGroup>
                      </Form.Group>

                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-white">Новий пароль</Form.Label>
                        <InputGroup>
                          <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                            <FaLock className="text-white" />
                          </InputGroup.Text>
                          <Form.Control
                            type="password"
                            placeholder="Новий надійний пароль"
                            value={newPassword}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewPassword(val);
                              setPasswordErrors(validatePassword(val));
                            }}
                            isInvalid={passwordErrors.length > 0 && newPassword.length > 0}
                            required
                            className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                          />
                        </InputGroup>

                        {newPassword.length > 0 && (
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
                        <Form.Label className="fw-medium text-white">Повторіть пароль</Form.Label>
                        <InputGroup>
                          <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                            <FaLock className="text-white" />
                          </InputGroup.Text>
                          <Form.Control
                            type="password"
                            placeholder="Повторіть пароль"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            isInvalid={confirmPassword !== '' && newPassword !== confirmPassword}
                            required
                            className="bg-white bg-opacity-25 border-0 text-white placeholder-white placeholder-opacity-75"
                          />
                        </InputGroup>
                        {confirmPassword !== '' && newPassword !== confirmPassword && (
                          <div className="invalid-feedback d-block text-danger">
                            Паролі не співпадають
                          </div>
                        )}
                      </Form.Group>

                      <Button
                        variant="primary"
                        type="submit"
                        className="w-100 py-3 fw-bold rounded-3 shadow-sm"
                        disabled={
                          passwordErrors.length > 0 ||
                          newPassword !== confirmPassword ||
                          newPassword.length === 0
                        }
                      >
                        Змінити пароль
                      </Button>
                    </Form>
                  )}

                  <div className="text-center mt-4">
                    <Link to="/login" className="text-white-75 text-decoration-none hover-text-white">
                      ← Повернутися до входу
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

export default ForgotPassword;