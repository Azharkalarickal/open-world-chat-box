// API Service for ProChat
const API = {
  getToken() {
    return localStorage.getItem('prochat_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('prochat_token', token);
    } else {
      localStorage.removeItem('prochat_token');
    }
  },

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async request(endpoint, options = {}) {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  // Auth endpoints
  async login(username, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(data.token);
    return data.user;
  },

  async register({ username, password, display_name, profession, skills, bio }) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, display_name, profession, skills, bio })
    });
    this.setToken(data.token);
    return data.user;
  },

  async getMe() {
    const data = await this.request('/api/auth/me');
    return data.user;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore logout error
    }
    this.setToken(null);
  },

  // Users & search
  async searchUsers(query = '') {
    const data = await this.request(`/api/users/search?q=${encodeURIComponent(query)}`);
    return data.users;
  },

  async getUser(id) {
    const data = await this.request(`/api/users/${id}`);
    return data.user;
  },

  // Messages
  async getWorldMessages() {
    const data = await this.request('/api/messages/world');
    return data.messages;
  },

  async getDirectMessages(otherUserId) {
    const data = await this.request(`/api/messages/direct/${otherUserId}`);
    return data.messages;
  },

  async getConversations() {
    const data = await this.request('/api/conversations');
    return data.conversations;
  }
};

