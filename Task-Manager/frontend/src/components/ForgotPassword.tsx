import { useState, FormEvent } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Container, Alert, ListGroup } from 'react-bootstrap';

const ForgotPassword = () => {
    const [step, setStep] = useState(1);
    const [username, setUsername] = useState('');
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [passwordErrors, setPasswordErrors] = useState<string[]>([]); // ← для списка ошибок

    const navigate = useNavigate();

    // Функция проверки сложности пароля (такая же, как в Register)
    const validatePassword = (pwd: string): string[] => {
        const errors: string[] = [];

        if (pwd.length < 8) {
            errors.push('Пароль повинен бути мінімум 8 символів');
        }
        if (!/[A-Z]/.test(pwd)) {
            errors.push('Повинна бути хоча б одна велика літера (A-Z)');
        }
        if (!/[a-z]/.test(pwd)) {
            errors.push('Повинна бути хоча б одна мала літера (a-z)');
        }
        if (!/[0-9]/.test(pwd)) {
            errors.push('Повинна бути хоча б одна цифра (0-9)');
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd)) {
            errors.push('Повинен бути хоча б один спеціальний символ (!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~)');
        }

        return errors;
    };

    const handleGetQuestion = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        try {
            const res = await axios.post('http://localhost:5000/api/auth/forgot-password/question', { username });
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

        if (pwdErrors.length > 0) {
            return; // не отправляем, пока пароль не ок
        }

        if (newPassword !== confirmPassword) {
            setError('Паролі не співпадають');
            return;
        }

        try {
            await axios.post('http://localhost:5000/api/auth/forgot-password/reset', {
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

    return (
        <Container className="mt-5" style={{ maxWidth: '400px' }}>
            <h2 className="text-center mb-4">Відновлення пароля</h2>

            {error && <Alert variant="danger">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            {step === 1 && (
                <Form onSubmit={handleGetQuestion}>
                    <Form.Group className="mb-3">
                        <Form.Label>Логін (username)</Form.Label>
                        <Form.Control
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </Form.Group>
                    <Button variant="primary" type="submit" className="w-100">
                        Продовжити
                    </Button>
                </Form>
            )}

            {step === 2 && (
                <Form onSubmit={handleVerifyAnswer}>
                    <div className="mb-3">
                        <strong>Секретне питання:</strong><br />
                        {question}
                    </div>

                    <Form.Group className="mb-3">
                        <Form.Label>Ваша відповідь</Form.Label>
                        <Form.Control
                            type="text"
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            required
                        />
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Новий пароль</Form.Label>
                        <Form.Control
                            type="password"
                            value={newPassword}
                            onChange={(e) => {
                                const val = e.target.value;
                                setNewPassword(val);
                                setPasswordErrors(validatePassword(val)); // ← обновляем ошибки сразу
                            }}
                            isInvalid={passwordErrors.length > 0}
                            required
                        />

                        {/* Список ошибок под полем — как в Register */}
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
                        <Form.Label>Повторіть пароль</Form.Label>
                        <Form.Control
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            isInvalid={confirmPassword !== '' && newPassword !== confirmPassword}
                            required
                        />
                        {confirmPassword !== '' && newPassword !== confirmPassword && (
                            <Form.Control.Feedback type="invalid">
                                Паролі не співпадають
                            </Form.Control.Feedback>
                        )}
                    </Form.Group>

                    <Button
                        variant="primary"
                        type="submit"
                        className="w-100"
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

            <div className="text-center mt-3">
                <Link to="/login">Повернутися до входу</Link>
            </div>
        </Container>
    );
};

export default ForgotPassword;