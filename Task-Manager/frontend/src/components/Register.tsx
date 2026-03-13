import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Container, Alert, ListGroup } from 'react-bootstrap';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]); // ← новое состояние

  const navigate = useNavigate();

  // Функция проверки сложности пароля
  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];

    if (pwd.length < 8) {
      errors.push('Пароль должен быть минимум 8 символов');
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push('Должна быть хотя бы одна заглавная буква (A-Z)');
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push('Должна быть хотя бы одна строчная буква (a-z)');
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push('Должна быть хотя бы одна цифра (0-9)');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd)) {
      errors.push('Должен быть хотя бы один специальный символ (!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~)');
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Проверяем пароль
    const pwdErrors = validatePassword(password);
    setPasswordErrors(pwdErrors);

    if (pwdErrors.length > 0) {
      return; // не отправляем форму, если есть ошибки
    }

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
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordErrors(validatePassword(e.target.value)); // проверяем сразу при вводе
            }}
            isInvalid={passwordErrors.length > 0}
            required
          />
          {/* Показываем ошибки под полем */}
          {passwordErrors.length > 0 && (
            <ListGroup variant="flush" className="mt-2 small text-danger">
              {passwordErrors.map((err, idx) => (
                <ListGroup.Item key={idx} className="border-0 p-1 text-danger">
                  • {err}
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
  <Form.Label>Секретный вопрос (для восстановления пароля)</Form.Label>
  <Form.Control 
    type="text" 
    value={securityQuestion} 
    onChange={e => setSecurityQuestion(e.target.value)} 
    placeholder="Например: Кличка первого питомца?"
    required 
  />
</Form.Group>

<Form.Group className="mb-3">
  <Form.Label>Ответ на секретный вопрос</Form.Label>
  <Form.Control 
    type="text" 
    value={securityAnswer} 
    onChange={e => setSecurityAnswer(e.target.value)} 
    required 
  />
</Form.Group>

        <Button variant="primary" type="submit" className="w-100 mb-3">
          Зарегистрироваться
        </Button>
      </Form>

      <div className="text-center">
        Уже есть аккаунт? <Link to="/login" className="text-primary fw-bold">Войти</Link>
      </div>
    </Container>
  );
};

export default Register;