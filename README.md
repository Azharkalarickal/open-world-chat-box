# 🌐 ProChat - Professional Open World & Direct Chat WebApp

A modern, responsive professional networking and chat platform featuring an **Open World Chat Box**, **1-on-1 Direct Messaging**, **Profession-Based Discovery**, and local **SQLite** database persistence.

---

## 🚀 Key Features

1. **User Onboarding & Professional Identity**:
   - Register with Display Name, Username, Secure Password, **Professional Role / Knowledge** (e.g., *Cardiologist, Cloud Architect, UI/UX Designer*), Key Skills, and Bio.
   - Distinct colored avatars and professional badges displayed across chat streams.

2. **🌍 World Chat Box (Global Stream)**:
   - Real-time public forum accessible to all logged-in users.
   - Text messages only for rapid information sharing.
   - Displays sender name, **professional badge**, timestamp, and content.
   - Messages are saved to the local SQLite database.

3. **💬 Direct 1-on-1 Personal Chat**:
   - Private, confidential text messaging between any two users.
   - Direct message delivery via dedicated Socket.IO rooms.
   - Persistent conversation history stored in SQLite.
   - Unread message counters & instant sidebar notifications.

4. **🔍 Profession Discovery & Instant Chat**:
   - Search bar filtering users in real-time by **job title, domain knowledge, skills, or name** (e.g. *Doctor, DevOps, Designer, AI*).
   - User profile cards showcasing skills chips, online/offline status, and a one-click **"Chat"** button that instantly opens a direct message thread.

5. **💾 Local Database Storage**:
   - Zero-cloud dependency: all user accounts, password hashes (bcrypt), world chat messages, and personal direct messages are stored locally in `prochat.db` (SQLite via `better-sqlite3`).

---

## 🛠️ Tech Stack

- **Backend**: Node.js & Express
- **Real-Time Communication**: Socket.IO
- **Database**: SQLite (`better-sqlite3`) with WAL mode enabled
- **Authentication**: JWT & `bcryptjs`
- **Frontend**: Modern Responsive HTML5, CSS3 (Enterprise Slate theme), and Vanilla JavaScript

---

## 🏃 Running the Application

### 1. Start the Server
```bash
npm start
```
The server will start on: **`http://localhost:3000`**

### 2. Getting Started
1. Open `http://localhost:3000` in your web browser.
2. Click **"Sign In / Register"** -> **"Create Account"**.
3. Enter your Name, Username, Password, and your **Professional Knowledge / Role** (e.g. *Full-Stack Engineer, Lawyer, UI/UX Designer*).
4. Start chatting in the **World Chat Box** or search for colleagues by profession to start personal 1-on-1 chats!

