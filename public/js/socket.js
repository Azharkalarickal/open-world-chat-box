// Real-time Socket.IO Manager for ProChat
class SocketClient {
  constructor() {
    this.socket = null;
    this.onlineUserIds = new Set();
    this.callbacks = {
      presenceUpdate: [],
      worldMessage: [],
      directMessage: [],
      messagesRead: []
    };
  }

  connect(token) {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to ProChat real-time socket:', this.socket.id);
    });

    this.socket.on('presence_update', (data) => {
      this.onlineUserIds = new Set(data.onlineUserIds || []);
      this.callbacks.presenceUpdate.forEach(cb => cb(this.onlineUserIds));
    });

    this.socket.on('new_world_message', (msg) => {
      this.callbacks.worldMessage.forEach(cb => cb(msg));
    });

    this.socket.on('new_direct_message', (msg) => {
      this.callbacks.directMessage.forEach(cb => cb(msg));
    });

    this.socket.on('messages_read', (data) => {
      this.callbacks.messagesRead.forEach(cb => cb(data));
    });

    this.socket.on('error_message', (err) => {
      console.warn('Socket error:', err);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendWorldMessage(content) {
    if (this.socket) {
      this.socket.emit('send_world_message', { content });
    }
  }

  sendDirectMessage(recipientId, content) {
    if (this.socket) {
      this.socket.emit('send_direct_message', { recipientId, content });
    }
  }

  markRead(senderId) {
    if (this.socket) {
      this.socket.emit('mark_read', { senderId });
    }
  }

  onPresenceUpdate(cb) { this.callbacks.presenceUpdate.push(cb); }
  onWorldMessage(cb) { this.callbacks.worldMessage.push(cb); }
  onDirectMessage(cb) { this.callbacks.directMessage.push(cb); }
  onMessagesRead(cb) { this.callbacks.messagesRead.push(cb); }
}

const socketClient = new SocketClient();

