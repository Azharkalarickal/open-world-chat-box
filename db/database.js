const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const isMySQL = Boolean(process.env.DB_HOST);
let mysqlPool = null;
let sqliteDb = null;

const colors = [
  '#2563eb', '#0891b2', '#0d9488', '#16a34a', 
  '#ca8a04', '#ea580c', '#e11d48', '#9333ea', '#4f46e5'
];

async function initDb() {
  if (isMySQL) {
    try {
      mysqlPool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '3306', 10),
        waitForConnections: true,
        connectionLimit: 10,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
      });

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS prochat_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(150) NOT NULL,
          profession VARCHAR(200) NOT NULL,
          skills TEXT,
          bio TEXT,
          avatar_color VARCHAR(30) DEFAULT '#3b82f6',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_prof (profession)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS prochat_world_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sender_id INT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES prochat_users(id) ON DELETE CASCADE,
          INDEX idx_wm_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS prochat_direct_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sender_id INT NOT NULL,
          recipient_id INT NOT NULL,
          content TEXT NOT NULL,
          is_read TINYINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES prochat_users(id) ON DELETE CASCADE,
          FOREIGN KEY (recipient_id) REFERENCES prochat_users(id) ON DELETE CASCADE,
          INDEX idx_pdm_pair (sender_id, recipient_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      console.log('✅ Connected to Hostinger MySQL Database (prochat_* tables)');
    } catch (err) {
      console.error('❌ Failed to connect to Hostinger MySQL, falling back to local SQLite:', err.message);
      initSQLite();
    }
  } else {
    initSQLite();
  }
}

function initSQLite() {
  const dbPath = path.join(__dirname, '..', 'prochat.db');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS prochat_users (
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

    CREATE TABLE IF NOT EXISTS prochat_world_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES prochat_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prochat_direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES prochat_users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES prochat_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_profession ON prochat_users(profession);
    CREATE INDEX IF NOT EXISTS idx_world_messages_created ON prochat_world_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_dm_pair ON prochat_direct_messages(sender_id, recipient_id, created_at);
  `);
  console.log('✅ Connected to Local SQLite Database (prochat.db)');
}

function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compareSync(plainPassword, passwordHash);
}

// User Helpers
async function createUser({ username, password, display_name, profession, skills = '', bio = '' }) {
  const password_hash = bcrypt.hashSync(password, 10);
  const avatar_color = colors[Math.floor(Math.random() * colors.length)];
  const cleanUsername = username.trim().toLowerCase();
  const cleanDisplayName = display_name.trim();
  const cleanProfession = profession.trim();
  const cleanSkills = (skills || '').trim();
  const cleanBio = (bio || '').trim();

  if (mysqlPool) {
    const [result] = await mysqlPool.query(
      `INSERT INTO prochat_users (username, password_hash, display_name, profession, skills, bio, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cleanUsername, password_hash, cleanDisplayName, cleanProfession, cleanSkills, cleanBio, avatar_color]
    );
    return getUserById(result.insertId);
  } else {
    const stmt = sqliteDb.prepare(`
      INSERT INTO prochat_users (username, password_hash, display_name, profession, skills, bio, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(cleanUsername, password_hash, cleanDisplayName, cleanProfession, cleanSkills, cleanBio, avatar_color);
    return getUserById(result.lastInsertRowid);
  }
}

async function getUserByUsername(username) {
  const cleanUsername = username.trim().toLowerCase();
  if (mysqlPool) {
    const [rows] = await mysqlPool.query('SELECT * FROM prochat_users WHERE username = ?', [cleanUsername]);
    return rows[0] || null;
  } else {
    const stmt = sqliteDb.prepare('SELECT * FROM prochat_users WHERE username = ?');
    return stmt.get(cleanUsername) || null;
  }
}

async function getUserById(id) {
  if (mysqlPool) {
    const [rows] = await mysqlPool.query(
      'SELECT id, username, display_name, profession, skills, bio, avatar_color, created_at FROM prochat_users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  } else {
    const stmt = sqliteDb.prepare(
      'SELECT id, username, display_name, profession, skills, bio, avatar_color, created_at FROM prochat_users WHERE id = ?'
    );
    return stmt.get(id) || null;
  }
}

async function searchUsers({ query = '', excludeUserId = null }) {
  const params = [];
  let sql = 'SELECT id, username, display_name, profession, skills, bio, avatar_color, created_at FROM prochat_users WHERE 1=1';

  if (excludeUserId) {
    sql += ' AND id != ?';
    params.push(excludeUserId);
  }

  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    sql += ' AND (profession LIKE ? OR display_name LIKE ? OR username LIKE ? OR skills LIKE ?)';
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY display_name ASC LIMIT 50';

  if (mysqlPool) {
    const [rows] = await mysqlPool.query(sql, params);
    return rows;
  } else {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(...params);
  }
}

// World Message Helpers
async function saveWorldMessage(senderId, content) {
  if (mysqlPool) {
    const [result] = await mysqlPool.query(
      'INSERT INTO prochat_world_messages (sender_id, content) VALUES (?, ?)',
      [senderId, content]
    );
    const [rows] = await mysqlPool.query(`
      SELECT m.id, m.content, m.created_at,
             u.id as sender_id, u.username, u.display_name, u.profession, u.avatar_color
      FROM prochat_world_messages m
      JOIN prochat_users u ON m.sender_id = u.id
      WHERE m.id = ?
    `, [result.insertId]);
    return rows[0];
  } else {
    const stmt = sqliteDb.prepare('INSERT INTO prochat_world_messages (sender_id, content) VALUES (?, ?)');
    const result = stmt.run(senderId, content);
    const getStmt = sqliteDb.prepare(`
      SELECT m.id, m.content, m.created_at,
             u.id as sender_id, u.username, u.display_name, u.profession, u.avatar_color
      FROM prochat_world_messages m
      JOIN prochat_users u ON m.sender_id = u.id
      WHERE m.id = ?
    `);
    return getStmt.get(result.lastInsertRowid);
  }
}

async function getRecentWorldMessages(limit = 100) {
  const sql = `
    SELECT m.id, m.content, m.created_at,
           u.id as sender_id, u.username, u.display_name, u.profession, u.avatar_color
    FROM prochat_world_messages m
    JOIN prochat_users u ON m.sender_id = u.id
    ORDER BY m.created_at ASC
    LIMIT ?
  `;

  if (mysqlPool) {
    const [rows] = await mysqlPool.query(sql, [limit]);
    return rows;
  } else {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(limit);
  }
}

// Direct Message Helpers
async function saveDirectMessage(senderId, recipientId, content) {
  if (mysqlPool) {
    const [result] = await mysqlPool.query(
      'INSERT INTO prochat_direct_messages (sender_id, recipient_id, content) VALUES (?, ?, ?)',
      [senderId, recipientId, content]
    );
    const [rows] = await mysqlPool.query(`
      SELECT m.id, m.content, m.is_read, m.created_at,
             m.sender_id, m.recipient_id,
             u.username as sender_username, u.display_name as sender_name, u.profession as sender_profession, u.avatar_color as sender_color
      FROM prochat_direct_messages m
      JOIN prochat_users u ON m.sender_id = u.id
      WHERE m.id = ?
    `, [result.insertId]);
    return rows[0];
  } else {
    const stmt = sqliteDb.prepare('INSERT INTO prochat_direct_messages (sender_id, recipient_id, content) VALUES (?, ?, ?)');
    const result = stmt.run(senderId, recipientId, content);
    const getStmt = sqliteDb.prepare(`
      SELECT m.id, m.content, m.is_read, m.created_at,
             m.sender_id, m.recipient_id,
             u.username as sender_username, u.display_name as sender_name, u.profession as sender_profession, u.avatar_color as sender_color
      FROM prochat_direct_messages m
      JOIN prochat_users u ON m.sender_id = u.id
      WHERE m.id = ?
    `);
    return getStmt.get(result.lastInsertRowid);
  }
}

async function getDirectMessagesBetween(user1Id, user2Id, limit = 100) {
  const sql = `
    SELECT m.id, m.content, m.is_read, m.created_at,
           m.sender_id, m.recipient_id,
           u.username as sender_username, u.display_name as sender_name, u.profession as sender_profession, u.avatar_color as sender_color
    FROM prochat_direct_messages m
    JOIN prochat_users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.recipient_id = ?)
       OR (m.sender_id = ? AND m.recipient_id = ?)
    ORDER BY m.created_at ASC
    LIMIT ?
  `;

  if (mysqlPool) {
    const [rows] = await mysqlPool.query(sql, [user1Id, user2Id, user2Id, user1Id, limit]);
    return rows;
  } else {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(user1Id, user2Id, user2Id, user1Id, limit);
  }
}

async function markDirectMessagesRead(recipientId, senderId) {
  const sql = 'UPDATE prochat_direct_messages SET is_read = 1 WHERE recipient_id = ? AND sender_id = ? AND is_read = 0';
  if (mysqlPool) {
    await mysqlPool.query(sql, [recipientId, senderId]);
  } else {
    const stmt = sqliteDb.prepare(sql);
    stmt.run(recipientId, senderId);
  }
}

async function getRecentDirectConversations(userId) {
  const sql = `
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
      FROM prochat_direct_messages
      WHERE sender_id = ? OR recipient_id = ?
    )
    SELECT 
      u.id, u.username, u.display_name, u.profession, u.avatar_color,
      cp.content as last_message,
      cp.created_at as last_message_time,
      cp.sender_id as last_message_sender,
      (
        SELECT COUNT(*) 
        FROM prochat_direct_messages dm 
        WHERE dm.sender_id = u.id AND dm.recipient_id = ? AND dm.is_read = 0
      ) as unread_count
    FROM ChatPartners cp
    JOIN prochat_users u ON cp.partner_id = u.id
    WHERE cp.rn = 1
    ORDER BY cp.created_at DESC
  `;

  if (mysqlPool) {
    const [rows] = await mysqlPool.query(sql, [userId, userId, userId, userId, userId]);
    return rows;
  } else {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(userId, userId, userId, userId, userId);
  }
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
