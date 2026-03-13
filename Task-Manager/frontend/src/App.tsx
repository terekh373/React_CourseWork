import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';          // адаптуй шлях, якщо в тебе інший
import Register from './components/Register';
import TaskList from './components/TaskList';   // або Tasks, TaskManager тощо

const App: React.FC = () => {
  const [token, setToken] = useState<string>(localStorage.getItem('token') || '');

  // Функція для оновлення токена після логіну
  const handleSetToken = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  return (
    <Router>
      <Routes>
        {/* Корінь → одразу на реєстрацію */}
        <Route path="/" element={<Navigate to="/register" replace />} />

        <Route 
          path="/register" 
          element={<Register />} 
        />

        <Route 
          path="/login" 
          element={<Login setToken={handleSetToken} />} 
        />

        {/* Захищений маршрут — тільки якщо є токен */}
        <Route 
          path="/tasks" 
          element={token ? <TaskList token={token} /> : <Navigate to="/login" replace />} 
        />

        {/* Якщо хтось зайде на невідомий шлях — редірект на реєстрацію */}
        <Route path="*" element={<Navigate to="/register" replace />} />
      </Routes>
    </Router>
  );
};

export default App;