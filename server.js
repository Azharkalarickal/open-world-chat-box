require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('./db/database');
const { BOT_USER, generateSpecialistPersona, generateBotReply, detectInquiryIntent } = require('./bot/ai');

const JWT_SECRET = process.env.JWT_SECRET || 'prochat-secret-key-2026-secure';
const PORT = process.env.PORT || 3000;

let BOT_USER_ID = null;
const aiBotUserIds = new Set();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware for Express
function authenticateToken(req, res, next) {
  let token = req.cookies.token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session' });
    }
    try {
      const user = await db.getUserById(decoded.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      req.user = user;
      next();
    } catch (e) {
      return res.status(500).json({ error: 'Authentication check failed' });
    }
  });
}

// ---------------- REST API ROUTES ----------------

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, display_name, profession, skills, bio } = req.body;

    if (!username || !password || !display_name || !profession) {
      return res.status(400).json({
        error: 'Display name, username, password, and profession are required.'
      });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
    }

    const newUser = await db.createUser({
      username,
      password,
      display_name,
      profession,
      skills: skills || '',
      bio: bio || ''
    });

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    res.status(201).json({ user: newUser, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await db.getUserByUsername(username);
    if (!user || !db.verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    const safeUser = await db.getUserById(user.id);
    res.json({ user: safeUser, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to sign in.' });
  }
});

// Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Search Users (filter by profession, name, skills)
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const query = req.query.q || '';
    const users = await db.searchUsers({ query, excludeUserId: req.user.id });
    res.json({ users });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ error: 'Failed to search users.' });
  }
});

// Fetch Single User Details
app.get('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const target = await db.getUserById(parseInt(req.params.id, 10));
    if (!target) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: target });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user details.' });
  }
});

// World Chat Message History
app.get('/api/messages/world', authenticateToken, async (req, res) => {
  try {
    const messages = await db.getRecentWorldMessages(100);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch world messages.' });
  }
});

// Direct Chat Message History between current user and target user
app.get('/api/messages/direct/:userId', authenticateToken, async (req, res) => {
  try {
    const otherUserId = parseInt(req.params.userId, 10);
    await db.markDirectMessagesRead(req.user.id, otherUserId);
    const messages = await db.getDirectMessagesBetween(req.user.id, otherUserId, 150);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch direct messages.' });
  }
});

// User Direct Conversations List (with unread counters)
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const conversations = await db.getRecentDirectConversations(req.user.id);
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

// ---------------- SOCKET.IO REAL-TIME CHAT ----------------

// Map of userId -> Set of socketIds
const onlineUsers = new Map();

// Helper to broadcast presence including 24/7 AI Bot and dynamic specialists
function broadcastPresence() {
  const ids = Array.from(onlineUsers.keys());
  aiBotUserIds.forEach(botId => {
    if (!ids.includes(botId)) {
      ids.push(botId);
    }
  });
  io.emit('presence_update', { onlineUserIds: ids });
}

// Socket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token || 
    (socket.handshake.headers.cookie && socket.handshake.headers.cookie.split('token=')[1]?.split(';')[0]);

  if (!token) {
    return next(new Error('Authentication token required'));
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    try {
      const user = await db.getUserById(decoded.id);
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (e) {
      next(e);
    }
  });
});

io.on('connection', (socket) => {
  const user = socket.user;
  const userId = user.id;

  // Add socket to user's active sockets
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);

  // Join user's personal room for direct messages
  socket.join(`user_${userId}`);
  // Join global world chat room
  socket.join('world_chat');

  // Broadcast presence
  broadcastPresence();

  // Handle World Message
  socket.on('send_world_message', async (data) => {
    try {
      const content = (data?.content || '').trim();
      if (!content) return;

      const savedMessage = await db.saveWorldMessage(userId, content);
      io.to('world_chat').emit('new_world_message', savedMessage);

      // Check if user is summoning a new specialist via @find <profession>
      const findMatch = content.match(/@find\s+(.+)/i);
      if (findMatch) {
        const professionQuery = findMatch[1].trim();
        if (professionQuery) {
          setTimeout(async () => {
            try {
              console.log(`🔍 Spawning new specialist for "${professionQuery}" requested by ${user.display_name}`);
              const persona = await generateSpecialistPersona(professionQuery);
              persona.password = '123456'; // as requested by user

              const newSpecialist = await db.createUser(persona);
              aiBotUserIds.add(newSpecialist.id);
              broadcastPresence();

              const welcomeMsg = `@${user.display_name} നമസ്കാരം! ഞാൻ ${newSpecialist.display_name} ആണ് (${newSpecialist.profession}). എന്റെ സഹായം വേണമെങ്കിൽ എനിക്ക് Personal Message അയച്ചാൽ മതി, ഞാൻ സഹായിക്കാം! 👋`;
              const savedBotMsg = await db.saveWorldMessage(newSpecialist.id, welcomeMsg);
              io.to('world_chat').emit('new_world_message', savedBotMsg);
            } catch (err) {
              console.error('Error creating specialist bot:', err);
            }
          }, 600);
        }
      }
    } catch (err) {
      console.error('Error handling world message:', err);
      socket.emit('error_message', { message: 'Could not send world message' });
    }
  });

  // Handle Direct 1-on-1 Message
  socket.on('send_direct_message', async (data) => {
    try {
      const recipientId = parseInt(data?.recipientId, 10);
      const content = (data?.content || '').trim();

      if (!recipientId || !content) return;
      if (recipientId === userId) {
        return socket.emit('error_message', { message: 'Cannot send message to yourself.' });
      }

      const recipient = await db.getUserById(recipientId);
      if (!recipient) {
        return socket.emit('error_message', { message: 'Recipient does not exist.' });
      }

      const savedMessage = await db.saveDirectMessage(userId, recipientId, content);

      // Emit to recipient's room
      io.to(`user_${recipientId}`).emit('new_direct_message', savedMessage);

      // Echo back to sender
      io.to(`user_${userId}`).emit('new_direct_message', savedMessage);

      // If recipient is any AI Specialist Bot (including ProBot)
      if (aiBotUserIds.has(recipientId) || (recipient && recipient.bio && recipient.bio.includes('[AI Professional]'))) {
        aiBotUserIds.add(recipientId);
        setTimeout(async () => {
          try {
            // Check if user is asking this specialist to contact or ask someone else
            const inquiry = await detectInquiryIntent(content);
            if (inquiry && inquiry.is_inquiry && inquiry.target_name) {
              console.log(`🤖 Cross-inquiry triggered: User asks ${recipient.display_name} to contact ${inquiry.target_name}`);

              // 1. Search for target in database
              const matches = await db.searchUsers({ query: inquiry.target_name });
              const target = matches.find(u => u.id !== userId && u.id !== recipientId) || matches[0];

              if (!target || target.id === recipientId || target.id === userId) {
                const notFoundReply = `ക്ഷമിക്കണം ${user.display_name}, '${inquiry.target_name}' എന്ന പേരിൽ ആരെയും നമ്മുടെ നെറ്റ്‌വർക്കിൽ ഇപ്പോൾ കാണുന്നില്ല. വേണമെങ്കിൽ വേൾഡ് ചാറ്റിൽ '@find ${inquiry.target_name}' എന്ന് നൽകിയാൽ നമുക്ക് ഉടൻ കണ്ടെത്താം കേട്ടോ! 😊`;
                const savedBotMsg = await db.saveDirectMessage(recipientId, userId, notFoundReply);
                io.to(`user_${userId}`).emit('new_direct_message', savedBotMsg);
                return;
              }

              // 2. Bot acknowledges user immediately
              const ackMsg = `തീർച്ചയായും! ഞാൻ ഇപ്പോൾ തന്നെ ${target.display_name}-ന് (${target.profession}) മെസ്സേജ് അയച്ചു ചോദിക്കാം. ഒരു മിനിറ്റ് കാക്കൂ കേട്ടോ! ⏳`;
              const savedAckMsg = await db.saveDirectMessage(recipientId, userId, ackMsg);
              io.to(`user_${userId}`).emit('new_direct_message', savedAckMsg);

              // 3. Bot sends direct message to target
              const inquiryMsgToTarget = `ഹലോ ${target.display_name}! നമ്മുടെ സുഹൃത്ത് ${user.display_name} താങ്കളോട് ഒരു കാര്യം ചോദിക്കാൻ എന്നോട് പറഞ്ഞിരുന്നു: "${inquiry.question}". താങ്കൾ ഇപ്പോൾ എന്താണ് ചെയ്യുന്നത് / ഇതിനെക്കുറിച്ച് എന്താണ് പറയാനുള്ളത്? ഒന്നു പറയാമോ? 😊`;
              const savedInquiryToTarget = await db.saveDirectMessage(recipientId, target.id, inquiryMsgToTarget);
              io.to(`user_${target.id}`).emit('new_direct_message', savedInquiryToTarget);
              io.to(`user_${recipientId}`).emit('new_direct_message', savedInquiryToTarget);

              // 4. Target responds back to Bot (simulated via AI based on target's profile if target is bot or offline)
              setTimeout(async () => {
                try {
                  const targetReply = await generateBotReply({
                    botProfile: target,
                    userMessage: inquiryMsgToTarget,
                    userName: recipient.display_name,
                    userProfession: recipient.profession,
                    conversationHistory: [savedInquiryToTarget]
                  });

                  // Save target's response to bot
                  const savedTargetResponse = await db.saveDirectMessage(target.id, recipientId, targetReply);
                  io.to(`user_${recipientId}`).emit('new_direct_message', savedTargetResponse);
                  io.to(`user_${target.id}`).emit('new_direct_message', savedTargetResponse);

                  // 5. Bot reports back to original User
                  setTimeout(async () => {
                    try {
                      const reportBackMsg = `ഞാൻ ${target.display_name}-നോട് ചോദിച്ചിരുന്നു കേട്ടോ! അവർ പറഞ്ഞ മറുപടി ഇതാണ്:\n\n💬 "${targetReply}"\n\nകൂടുതൽ എന്തെങ്കിലും അറിയണമെന്നുണ്ടോ? ഞാൻ ചോദിച്ചു തരാം! 😊`;
                      const savedReportMsg = await db.saveDirectMessage(recipientId, userId, reportBackMsg);
                      io.to(`user_${userId}`).emit('new_direct_message', savedReportMsg);
                    } catch (errReport) {
                      console.error('Error sending report back to user:', errReport);
                    }
                  }, 1200);

                } catch (errTargetReply) {
                  console.error('Error generating target reply:', errTargetReply);
                }
              }, 1500);

              return; // Stop here, inquiry handled
            }

            // Normal 1-on-1 response if not a cross-inquiry
            const history = await db.getDirectMessagesBetween(userId, recipientId, 8);
            const botReply = await generateBotReply({
              botProfile: recipient,
              userMessage: content,
              userName: user.display_name,
              userProfession: user.profession,
              conversationHistory: history
            });

            const savedBotMsg = await db.saveDirectMessage(recipientId, userId, botReply);
            io.to(`user_${userId}`).emit('new_direct_message', savedBotMsg);
          } catch (e) {
            console.error('Specialist personal reply error:', e);
          }
        }, 500);
      }
    } catch (err) {
      console.error('Error handling direct message:', err);
      socket.emit('error_message', { message: 'Could not send direct message' });
    }
  });

  // Handle Mark As Read
  socket.on('mark_read', async (data) => {
    try {
      const senderId = parseInt(data?.senderId, 10);
      if (senderId) {
        await db.markDirectMessagesRead(userId, senderId);
        // Inform the sender that their messages have been read
        io.to(`user_${senderId}`).emit('messages_read', { readByUserId: userId });
      }
    } catch (err) {
      console.error('Error marking messages read:', err);
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    const userSockets = onlineUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }
    // Update presence
    broadcastPresence();
  });
});

// Server Initialization
async function startServer() {
  try {
    await db.initDb();

    // Ensure system AI bot user exists
    let botUser = await db.getUserByUsername(BOT_USER.username);
    if (!botUser) {
      botUser = await db.createUser(BOT_USER);
      console.log(`🤖 Initialized ProBot AI with ID: ${botUser.id}`);
    }
    BOT_USER_ID = botUser.id;
    aiBotUserIds.add(BOT_USER_ID);

    // Also load any existing dynamically created AI specialist bots
    const allBots = await db.searchUsers({ query: '[AI Professional]' });
    allBots.forEach(b => aiBotUserIds.add(b.id));
    console.log(`🤖 Total active AI specialist bots: ${aiBotUserIds.size}`);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`=================================================`);
      console.log(`🚀 ProChat Server is running on port ${PORT}`);
      console.log(`=================================================`);
    });
  } catch (err) {
    console.error('Failed to start ProChat server:', err);
    process.exit(1);
  }
}

startServer();
