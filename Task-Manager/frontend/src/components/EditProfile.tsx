import React, { useState, useEffect, FormEvent } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
    Container, Form, Button, Alert, InputGroup,
    ProgressBar, ListGroup, Image
} from 'react-bootstrap';
import { motion, AnimatePresence } from 'framer-motion';
import { FaUser, FaLock, FaKey, FaArrowLeft, FaCamera, FaCheckCircle } from 'react-icons/fa';

interface EditProfileProps {
    token: string;
}

type Step = 'verify' | 'edit';

const EditProfile: React.FC<EditProfileProps> = ({ token }) => {
    const navigate = useNavigate();

    // ── Step state ──────────────────────────────────────────
    const [step, setStep] = useState<Step>('verify');

    // ── Verify step ──────────────────────────────────────────
    const [securityQuestion, setSecurityQuestion] = useState('');
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [verifyError, setVerifyError] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);

    // ── User data ────────────────────────────────────────────
    const [currentUsername, setCurrentUsername] = useState('');
    const [currentDisplayName, setCurrentDisplayName] = useState('');
    const [currentAvatar, setCurrentAvatar] = useState('');

    // ── Edit fields ──────────────────────────────────────────
    const [newUsername, setNewUsername] = useState('');
    const [newDisplayName, setNewDisplayName] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

    // ── Feedback ─────────────────────────────────────────────
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        document.title = 'Редагування профілю | TaskFlow';
        return () => { document.title = 'TaskFlow'; }; // сброс при уходе со страницы
    }, []);

    // ── Load user + security question ────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const u = res.data;
                setCurrentUsername(u.username);
                setCurrentDisplayName(u.displayName || u.username);
                setCurrentAvatar(u.avatar || '');
                setNewUsername(u.username);
                setNewDisplayName(u.displayName || u.username);
            } catch {
                navigate('/tasks');
            }
        };
        load();
    }, [token, navigate]);

    useEffect(() => {
        if (currentUsername) {
            axios
                .post(`${process.env.REACT_APP_API_URL}/api/auth/forgot-password/question`, {
                    username: currentUsername,
                })
                .then(res => setSecurityQuestion(res.data.question))
                .catch(() => setSecurityQuestion(''));
        }
    }, [currentUsername]);

    // ── Password validation ──────────────────────────────────
    const validatePassword = (pwd: string): string[] => {
        const errors: string[] = [];
        if (pwd.length < 8) errors.push('Мінімум 8 символів');
        if (!/[A-Z]/.test(pwd)) errors.push('Одна велика літера');
        if (!/[a-z]/.test(pwd)) errors.push('Одна мала літера');
        if (!/[0-9]/.test(pwd)) errors.push('Одна цифра');
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd))
            errors.push('Спеціальний символ');
        return errors;
    };

    const getPasswordStrength = () => {
        const errors = validatePassword(newPassword);
        if (newPassword.length === 0) return { variant: 'danger' as const, label: '', value: 0 };
        if (errors.length === 0) return { variant: 'success' as const, label: 'Дуже сильний', value: 100 };
        if (errors.length <= 2) return { variant: 'warning' as const, label: 'Середній', value: 60 };
        return { variant: 'danger' as const, label: 'Слабкий', value: 30 };
    };

    const strength = getPasswordStrength();

    // ── Step 1: verify security answer ───────────────────────
    const handleVerify = async (e: FormEvent) => {
        e.preventDefault();
        setVerifyError('');
        setVerifyLoading(true);
        try {
            // Re-use the forgot-password/question endpoint just to validate answer
            // We do a "dry-run" reset with a dummy new password to validate the answer
            // Actually we verify by trying the reset route but we don't want to change password.
            // Instead, we call a lightweight check: POST /api/auth/verify-security-answer
            // If that doesn't exist, we fall back to checking via forgot-password/reset with current password.
            // Best approach: call /forgot-password/reset but pass the current (same) password so nothing changes.
            // We'll use a dedicated verify endpoint — if your backend doesn't have it, see note below.

            // ── OPTION: call a lightweight endpoint you add to auth.ts (see below) ──
            await axios.post(`${process.env.REACT_APP_API_URL}/api/auth/verify-security-answer`, {
                username: currentUsername,
                answer: securityAnswer,
            }, { headers: { Authorization: `Bearer ${token}` } });

            setStep('edit');
        } catch (err: any) {
            setVerifyError(err.response?.data?.message || 'Невірна відповідь на секретне питання');
        } finally {
            setVerifyLoading(false);
        }
    };

    // ── Avatar preview ───────────────────────────────────────
    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = () => setAvatarPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    // ── Save all changes ─────────────────────────────────────
    const handleSave = async () => {
        setErrorMsg('');
        setSuccessMsg('');
        setSaving(true);

        const results: string[] = [];
        const errors: string[] = [];

        // 1. Username
        if (newUsername !== currentUsername) {
            try {
                await axios.put(
                    `${process.env.REACT_APP_API_URL}/api/auth/change-username`,
                    { newUsername },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                setCurrentUsername(newUsername);
                results.push('Логін оновлено');
            } catch (err: any) {
                errors.push(err.response?.data?.message || 'Помилка зміни логіну');
            }
        }

        // 2. DisplayName
        if (newDisplayName !== currentDisplayName) {
            try {
                await axios.put(
                    `${process.env.REACT_APP_API_URL}/api/auth/change-displayname`,
                    { newDisplayName },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                setCurrentDisplayName(newDisplayName);
                results.push('Нік оновлено');
            } catch (err: any) {
                errors.push(err.response?.data?.message || 'Помилка зміни ніку');
            }
        }

        // 3. Avatar
        if (avatarFile) {
            try {
                const formData = new FormData();
                formData.append('avatar', avatarFile);
                const res = await axios.post(
                    `${process.env.REACT_APP_API_URL}/api/auth/upload-avatar`,
                    formData,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'multipart/form-data',
                        },
                    }
                );
                setCurrentAvatar(res.data.avatar);
                setAvatarFile(null);
                setAvatarPreview(null);
                results.push('Аватарку оновлено');
            } catch (err: any) {
                errors.push(err.response?.data?.message || 'Помилка завантаження аватарки');
            }
        }

        // 4. Password
        if (newPassword) {
            const pwdErr = validatePassword(newPassword);
            if (pwdErr.length > 0) {
                errors.push('Пароль не відповідає вимогам');
            } else if (newPassword !== confirmPassword) {
                errors.push('Нові паролі не співпадають');
            } else if (!oldPassword) {
                errors.push('Введіть старий пароль');
            } else {
                try {
                    await axios.put(
                        `${process.env.REACT_APP_API_URL}/api/auth/change-password`,
                        { oldPassword, newPassword, confirmPassword },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    results.push('Пароль змінено');
                } catch (err: any) {
                    errors.push(err.response?.data?.message || 'Помилка зміни пароля');
                }
            }
        }

        setSaving(false);

        if (errors.length > 0) setErrorMsg(errors.join(' · '));
        if (results.length > 0) setSuccessMsg(results.join(' · '));
    };

    // ── Shared background ─────────────────────────────────────
    const bgStyle: React.CSSProperties = {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 40%, #5e60ce 100%)',
        backgroundSize: '200% 200%',
        animation: 'gradientShift 18s ease infinite',
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
    };

    const cardStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.18)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 8px 32px rgba(31,38,135,0.37)',
        borderRadius: '1rem',
    };

    // ════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════
    return (
        <div style={bgStyle} className="d-flex align-items-center py-5">
            {/* radial overlay */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.12) 0%, transparent 60%)',
                pointerEvents: 'none',
            }} />

            <Container className="position-relative z-1">
                <div className="row justify-content-center">
                    <div className="col-12 col-md-8 col-lg-6">

                        {/* Back button */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4 }}
                            className="mb-3"
                        >
                            <Button
                                variant="link"
                                className="text-white text-decoration-none ps-0 d-flex align-items-center gap-2"
                                onClick={() => navigate('/tasks')}
                            >
                                <FaArrowLeft /> Повернутися до TaskManager
                            </Button>
                        </motion.div>

                        <AnimatePresence mode="wait">

                            {/* ─────── STEP 1: Security Question ─────── */}
                            {step === 'verify' && (
                                <motion.div
                                    key="verify"
                                    initial={{ opacity: 0, y: 40 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -40 }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                >
                                    <div style={cardStyle} className="p-5">
                                        <div className="text-center mb-4">
                                            <div
                                                className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                                                style={{
                                                    width: 64, height: 64,
                                                    background: 'rgba(255,255,255,0.2)',
                                                    border: '1px solid rgba(255,255,255,0.3)',
                                                }}
                                            >
                                                <FaKey size={24} color="white" />
                                            </div>
                                            <h4 className="fw-bold text-white mb-1">Підтвердження особи</h4>
                                            <p className="text-white-50 small mb-0">
                                                Для редагування профілю потрібно відповісти на секретне питання
                                            </p>
                                        </div>

                                        {verifyError && (
                                            <Alert variant="danger" className="rounded-3">{verifyError}</Alert>
                                        )}

                                        <Form onSubmit={handleVerify}>
                                            {securityQuestion && (
                                                <div className="mb-4 p-3 rounded-3" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                                    <div className="text-white-50 small mb-1">Секретне питання:</div>
                                                    <div className="text-white fw-medium">{securityQuestion}</div>
                                                </div>
                                            )}

                                            <Form.Group className="mb-4">
                                                <Form.Label className="fw-medium text-white">Ваша відповідь</Form.Label>
                                                <InputGroup>
                                                    <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                                                        <FaKey className="text-white" />
                                                    </InputGroup.Text>
                                                    <Form.Control
                                                        type="text"
                                                        placeholder="Введіть відповідь..."
                                                        value={securityAnswer}
                                                        onChange={e => setSecurityAnswer(e.target.value)}
                                                        required
                                                        className="bg-white bg-opacity-25 border-0 text-white placeholder-white"
                                                    />
                                                </InputGroup>
                                            </Form.Group>

                                            <Button
                                                type="submit"
                                                className="reglog-btn w-100 py-3 fw-bold rounded-3"
                                                disabled={!securityAnswer.trim() || verifyLoading}
                                            >
                                                {verifyLoading ? 'Перевірка...' : 'Підтвердити та перейти до редагування'}
                                            </Button>
                                        </Form>
                                    </div>
                                </motion.div>
                            )}

                            {/* ─────── STEP 2: Edit Profile ─────── */}
                            {step === 'edit' && (
                                <motion.div
                                    key="edit"
                                    initial={{ opacity: 0, y: 40 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -40 }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                >
                                    <div style={cardStyle} className="p-5">
                                        {/* Header */}
                                        <div className="text-center mb-4">
                                            <div className="position-relative d-inline-block mb-3">
                                                {avatarPreview || currentAvatar ? (
                                                    <Image
                                                        src={avatarPreview || `${process.env.REACT_APP_API_URL}${currentAvatar}`}
                                                        roundedCircle
                                                        width={96} height={96}
                                                        style={{ objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)' }}
                                                    />
                                                ) : (
                                                    <div
                                                        className="d-flex align-items-center justify-content-center rounded-circle"
                                                        style={{
                                                            width: 96, height: 96,
                                                            background: 'rgba(255,255,255,0.2)',
                                                            border: '3px solid rgba(255,255,255,0.4)',
                                                        }}
                                                    >
                                                        <FaUser size={36} color="white" />
                                                    </div>
                                                )}

                                                {/* Camera overlay */}
                                                <label
                                                    htmlFor="avatar-upload"
                                                    className="position-absolute bottom-0 end-0 d-flex align-items-center justify-content-center rounded-circle"
                                                    style={{
                                                        width: 30, height: 30,
                                                        background: 'rgba(79,140,255,0.9)',
                                                        cursor: 'pointer',
                                                        border: '2px solid white',
                                                    }}
                                                >
                                                    <FaCamera size={13} color="white" />
                                                </label>
                                                <input
                                                    id="avatar-upload"
                                                    type="file"
                                                    accept="image/jpeg,image/png"
                                                    className="d-none"
                                                    onChange={handleAvatarChange}
                                                />
                                            </div>

                                            <h4 className="fw-bold text-white mb-0">{currentDisplayName}</h4>
                                            <div className="text-white-50 small">@{currentUsername}</div>

                                            {avatarFile && (
                                                <div className="mt-2">
                                                    <span className="badge rounded-pill px-3 py-2" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '0.75rem' }}>
                                                        📎 {avatarFile.name} — буде збережено
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {errorMsg && <Alert variant="danger" className="rounded-3">{errorMsg}</Alert>}
                                        {successMsg && (
                                            <Alert variant="success" className="rounded-3 d-flex align-items-center gap-2">
                                                <FaCheckCircle /> {successMsg}
                                            </Alert>
                                        )}

                                        {/* ─ Username ─ */}
                                        <Form.Group className="mb-4">
                                            <Form.Label className="fw-medium text-white">Логін</Form.Label>
                                            <InputGroup>
                                                <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                                                    <FaUser className="text-white" />
                                                </InputGroup.Text>
                                                <Form.Control
                                                    type="text"
                                                    value={newUsername}
                                                    onChange={e => setNewUsername(e.target.value)}
                                                    className="bg-white bg-opacity-25 border-0 text-white"
                                                />
                                            </InputGroup>
                                        </Form.Group>

                                        {/* ─ DisplayName ─ */}
                                        <Form.Group className="mb-4">
                                            <Form.Label className="fw-medium text-white">Відображуване ім'я</Form.Label>
                                            <InputGroup>
                                                <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                                                    <FaUser className="text-white" />
                                                </InputGroup.Text>
                                                <Form.Control
                                                    type="text"
                                                    value={newDisplayName}
                                                    onChange={e => setNewDisplayName(e.target.value)}
                                                    className="bg-white bg-opacity-25 border-0 text-white"
                                                />
                                            </InputGroup>
                                        </Form.Group>

                                        {/* ─ Password section ─ */}
                                        <div className="mb-3 mt-2">
                                            <div className="text-white-50 small text-uppercase fw-bold mb-3" style={{ letterSpacing: '0.08em' }}>
                                                Зміна пароля (необов'язково)
                                            </div>

                                            <Form.Group className="mb-3">
                                                <Form.Label className="fw-medium text-white">Старий пароль</Form.Label>
                                                <InputGroup>
                                                    <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                                                        <FaLock className="text-white" />
                                                    </InputGroup.Text>
                                                    <Form.Control
                                                        type="password"
                                                        placeholder="Поточний пароль"
                                                        value={oldPassword}
                                                        onChange={e => setOldPassword(e.target.value)}
                                                        className="bg-white bg-opacity-25 border-0 text-white placeholder-white"
                                                    />
                                                </InputGroup>
                                            </Form.Group>

                                            <Form.Group className="mb-3">
                                                <Form.Label className="fw-medium text-white">Новий пароль</Form.Label>
                                                <InputGroup>
                                                    <InputGroup.Text className="bg-white bg-opacity-25 border-0">
                                                        <FaLock className="text-white" />
                                                    </InputGroup.Text>
                                                    <Form.Control
                                                        type="password"
                                                        placeholder="Новий надійний пароль"
                                                        value={newPassword}
                                                        onChange={e => {
                                                            setNewPassword(e.target.value);
                                                            setPasswordErrors(validatePassword(e.target.value));
                                                        }}
                                                        className="bg-white bg-opacity-25 border-0 text-white placeholder-white"
                                                    />
                                                </InputGroup>

                                                {newPassword.length > 0 && (
                                                    <div className="mt-2">
                                                        <ProgressBar
                                                            variant={strength.variant}
                                                            now={strength.value}
                                                            className="mb-1 rounded-pill"
                                                            style={{ height: '6px' }}
                                                        />
                                                        <small className={`d-block text-${strength.variant}`}>{strength.label}</small>
                                                    </div>
                                                )}

                                                {passwordErrors.length > 0 && newPassword.length > 0 && (
                                                    <ListGroup variant="flush" className="mt-1 small">
                                                        {passwordErrors.map((e, i) => (
                                                            <ListGroup.Item key={i} className="border-0 p-0 pb-1 text-danger bg-transparent">
                                                                • {e}
                                                            </ListGroup.Item>
                                                        ))}
                                                    </ListGroup>
                                                )}
                                            </Form.Group>

                                            <Form.Group className="mb-4">
                                                <Form.Label className="fw-medium text-white">Підтвердити новий пароль</Form.Label>
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
                                                        className="bg-white bg-opacity-25 border-0 text-white placeholder-white"
                                                    />
                                                </InputGroup>
                                                {confirmPassword !== '' && newPassword !== confirmPassword && (
                                                    <div className="text-danger small mt-1">Паролі не співпадають</div>
                                                )}
                                            </Form.Group>
                                        </div>

                                        <Button
                                            className="reglog-btn w-100 py-3 fw-bold rounded-3"
                                            onClick={handleSave}
                                            disabled={saving}
                                        >
                                            {saving ? 'Зберігаємо...' : 'Зберегти зміни'}
                                        </Button>
                                    </div>
                                </motion.div>
                            )}

                        </AnimatePresence>
                    </div>
                </div>
            </Container>
        </div>
    );
};

export default EditProfile;