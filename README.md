# 🌊 TaskFlow — Real-Time Collaborative Kanban Board

<div align="center">

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

🔗 **[Live Demo →](https://react-course-work-mu.vercel.app)**

> A full-stack Kanban task manager with real-time collaboration via WebSockets.  
> Frontend on **Vercel** · Backend on **Render.com** · Database on **MongoDB Atlas** — available 24/7

</div>

---

## ✨ Features at a Glance

| 🎯 Feature | Description |
|-----------|-------------|
| ⚡ Real-time sync | Changes instantly appear for all board members via WebSockets |
| 🖱️ Drag & Drop | Smooth card reordering between and within columns |
| 👥 Collaboration | Up to 5 members per board with invite codes |
| 📊 Analytics | Charts for task status, priorities, and deadlines |
| 🔐 Auth | Full JWT authentication with bcrypt password hashing |
| 🌙 Themes | Dark and Light mode with Glassmorphism design |

---

## 🛠️ Tech Stack

### Frontend
| Library | Purpose |
|---------|---------|
| ⚛️ React 18 + TypeScript | Core framework |
| 🖱️ React Beautiful DnD | Drag & Drop functionality |
| ⚡ Socket.IO Client | Real-time WebSocket communication |
| 📊 Chart.js | Analytics and data visualization |
| 🎨 Bootstrap 5 + Framer Motion | Styling and animations |
| 🔔 SweetAlert2 | Toast notifications |

### Backend
| Library | Purpose |
|---------|---------|
| 🟢 Node.js + Express | REST API server |
| 🍃 MongoDB + Mongoose | Database and ODM |
| ⚡ Socket.IO Server | Real-time event handling |
| 🔐 JWT + bcrypt | Authentication and security |
| 📁 Multer | File uploads (avatars) |

**Deploy:** Vercel (frontend) · Render.com (backend) · MongoDB Atlas (database)

---

## 🏗️ Architecture

```
┌─────────────────────┐     REST API      ┌────────────────────┐
│   Frontend (Vercel) │ ◄───────────────► │ Backend (Render)   │
│   React SPA         │                   │ Express + Socket.IO│
│                     │ ◄── WebSocket ──► │                    │
└─────────────────────┘                   └────────────┬───────┘
                                                       │ Mongoose ODM
                                          ┌────────────▼───────┐
                                          │  MongoDB Atlas     │
                                          │  Users / Boards /  │
                                          │  Tasks / Friends   │
                                          └────────────────────┘
```

---

## 📋 Functionality

### 🗂️ Kanban Board
- Three columns: **To Do → In Progress → Done**
- Drag & Drop between and within columns
- Priority levels (🔴 High / 🟡 Medium / 🟢 Low) with color highlighting
- Deadlines with automatic overdue highlighting
- Labels and tags for task categorization
- Full-text search and filters

### ⚡ Real-Time Collaboration (Socket.IO)
- New tasks and changes sync instantly for all participants
- Drag & Drop reflected in real-time for all board users
- 🟢 Online indicators — see who's currently active on the board
- Toast notifications for team member actions
- Socket.IO Rooms — isolated events per board

### 👥 Boards & Teams
- Up to 3 boards per user
- Up to 5 members per board
- Invite via unique code
- Member avatars with online status
- Friend system (add, accept, remove)

### 🔐 Authentication
- Secure registration with password validation (bcrypt)
- JWT tokens with 7-day expiry
- Password recovery via security question
- Profile editing (nickname, avatar, password)

### 📊 Statistics & UX
- Pie chart by task status
- Bar chart by priorities
- Top-5 labels and tags
- Overdue task list
- Glassmorphism design · Dark/Light theme · Adaptive interface

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Frontend
```bash
cd Task-Manager
npm install
npm start
```

### Backend
```bash
npm install

# Create .env file:
# MONGO_URI=your_mongodb_uri
# JWT_SECRET=your_secret_key
# PORT=5000

npm start
```

---

## 📊 Project Stats

| Metric | Value |
|--------|-------|
| 📝 Lines of code | 3000+ |
| 🔌 API routes | 5 |
| 🗄️ MongoDB models | 4 (User, Board, Task, FriendRequest) |
| ⚡ Socket.IO events | 15+ |
| 📐 UML diagrams | 6 |
| 🌍 Deployment | Public, 24/7 |

---

## 👤 Author

**Anton Tereshchenko** — [github.com/terekh373](https://github.com/terekh373) · [LinkedIn](https://www.linkedin.com/in/anton-tereshchenko-o) · [Live Demo](https://react-course-work-mu.vercel.app)
