const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'prochat.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      profession TEXT NOT NULL,
      skills TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      avatar_color TEXT DEFAULT '#3b82f6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS world_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_profession ON users(profession);
    CREATE INDEX IF NOT EXISTS idx_world_messages_created ON world_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_id, recipient_id, created_at);
  `);
}

// User Helpers
function createUser({ username, password, display_name, profession, skills = '', bio = '' }) {
  const password_hash = bcrypt.hashSync(password, 10);
  // Generate a distinct avatar color from a curated professional palette
  const colors = [
    '#2563eb', '#0891b2', '#0d9488', '#16a34a', 
    '#ca8a04', '#ea580c', '#e11d48', '#9333ea', '#4f46e5'
  ];
  const avatar_color = colors[Math.floor(Math.random() * colors.length)];

  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, profession, skills, bio, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(username.trim().toLowerCase(), password_hash, display_name.trim(), profession.trim(), skills.trim(), bio.trim(), avatar_color);
  return getUserById(result.lastInsertRowid);
}

function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username.trim().toLowerCase());
}

function getUserById(id) {
  const stmt = db.prepare(`
    SELECT id, username, display_name, profession, skills, bio, avatar_color, created_at
    FROM users WHERE id = ?
  `);
  return stmt.get(id);
}

function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compareSync(plainPassword, passwordHash);
}

function searchUsers({ query = '', excludeUserId = null }) {
  let sql = `
    SELECT id, username, display_name, profession, skills, bio, avatar_color, created_at
    FROM users
    WHERE 1=1
  `;
  const params = [];

  if (excludeUserId) {
    sql += ` AND id != ?`;
    params.push(excludeUserId);
  }

  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    sql += ` AND (profession LIKE ? OR display_name LIKE ? OR username LIKE ? OR skills LIKE ?)`;
    params.push(q, q, q, q);
  }

  sql += ` ORDER BY display_name ASC LIMIT 50`;
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

// World Message Helpers
function saveWorldMessage(senderId, content) {
  const stmt = db.prepare(`
    INSERT INTO world_messages (sender_id, content)
    VALUES (?, ?)
  `);
  const result = stmt.run(senderId, content);
  
  const getStmt = db.prepare(`
    SELECT m.id, m.content, m.created_at,
           u.id as sender_id, u.username, u.display_name, u.profession, u.avatar_color
    FROM world_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.id = ?
  `);
  return getStmt.get(result.lastInsertRowid);
}

function getRecentWorldMessages(limit = 100) {
  const stmt = db.prepare(`
    SELECT m.id, m.content, m.created_at,
           u.id as sender_id, u.username, u.display_name, u.profession, u.avatar_color
    FROM world_messages m
    JOIN users u ON m.sender_id = u.id
    ORDER BY m.created_at ASC
    LIMIT ?
  `);
  return stmt.all(limit);
}

// Direct Message Helpers
function saveDirectMessage(senderId, recipientId, content) {
  const stmt = db.prepare(`
    INSERT INTO direct_messages (sender_id, recipient_id, content)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(senderId, recipientId, content);

  const getStmt = db.prepare(`
    SELECT m.id, m.content, m.is_read, m.created_at,
           m.sender_id, m.recipient_id,
           u.username as sender_username, u.display_name as sender_name, u.profession as sender_profession, u.avatar_color as sender_color
    FROM direct_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.id = ?
  `);
  return getStmt.get(result.lastInsertRowid);
}

function getDirectMessagesBetween(user1Id, user2Id, limit = 100) {
  const stmt = db.prepare(`
    SELECT m.id, m.content, m.is_read, m.created_at,
           m.sender_id, m.recipient_id,
           u.username as sender_username, u.display_name as sender_name, u.profession as sender_profession, u.avatar_color as sender_color
    FROM direct_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.recipient_id = ?)
       OR (m.sender_id = ? AND m.recipient_id = ?)
    ORDER BY m.created_at ASC
    LIMIT ?
  `);
  return stmt.all(user1Id, user2Id, user2Id, user1Id, limit);
}

function markDirectMessagesRead(recipientId, senderId) {
  const stmt = db.prepare(`
    UPDATE direct_messages
    SET is_read = 1
    WHERE recipient_id = ? AND sender_id = ? AND is_read = 0
  `);
  return stmt.run(recipientId, senderId);
}

function getRecentDirectConversations(userId) {
  // Returns list of unique users this user has chatted with, plus unread count and latest message
  const stmt = db.prepare(`
    WITH ChatPartners AS (
      SELECT 
        CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS partner_id,
        content,
        created_at,
        is_read,
        sender_id,
        ROW_NUMBER() OVER (
          PARTITION BY CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END 
          ORDER BY created_at DESC, id DESC
        ) as rn
      FROM direct_messages
      WHERE sender_id = ? OR recipient_id = ?
    )
    SELECT 
      u.id, u.username, u.display_name, u.profession, u.avatar_color,
      cp.content as last_message,
      cp.created_at as last_message_time,
      cp.sender_id as last_message_sender,
      (
        SELECT COUNT(*) 
        FROM direct_messages dm 
        WHERE dm.sender_id = u.id AND dm.recipient_id = ? AND dm.is_read = 0
      ) as unread_count
    FROM ChatPartners cp
    JOIN users u ON cp.partner_id = u.id
    WHERE cp.rn = 1
    ORDER BY cp.created_at DESC
  `);
  return stmt.all(userId, userId, userId, userId, userId);
}

module.exports = {
  initDb,
  createUser,
  getUserByUsername,
  getUserById,
  verifyPassword,
  searchUsers,
  saveWorldMessage,
  getRecentWorldMessages,
  saveDirectMessage,
  getDirectMessagesBetween,
  markDirectMessagesRead,
  getRecentDirectConversations
};

