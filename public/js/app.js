// Main Application Logic for ProChat
(function () {
  'use strict';

  // Application State
  const state = {
    currentUser: null,
    currentView: 'world', // 'world' | 'direct' | 'discover'
    activeDirectUser: null, // { id, display_name, username, profession, skills, bio, avatar_color }
    onlineUserIds: new Set(),
    conversations: [],
    searchDebounceTimer: null
  };

  // DOM Elements
  const elements = {
    // Header
    userProfileHeader: document.getElementById('userProfileHeader'),
    guestHeaderActions: document.getElementById('guestHeaderActions'),
    headerAvatar: document.getElementById('headerAvatar'),
    headerDisplayName: document.getElementById('headerDisplayName'),
    headerProfession: document.getElementById('headerProfession'),
    logoutBtn: document.getElementById('logoutBtn'),
    openAuthModalBtn: document.getElementById('openAuthModalBtn'),
    globalSearchInput: document.getElementById('globalSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),

    // Sidebar
    navWorldChat: document.getElementById('navWorldChat'),
    navDiscover: document.getElementById('navDiscover'),
    conversationsList: document.getElementById('conversationsList'),
    conversationCount: document.getElementById('conversationCount'),

    // Views
    worldChatView: document.getElementById('worldChatView'),
    directChatView: document.getElementById('directChatView'),
    discoverView: document.getElementById('discoverView'),

    // World Chat
    onlineCountText: document.getElementById('onlineCountText'),
    worldMessagesList: document.getElementById('worldMessagesList'),
    worldMessageForm: document.getElementById('worldMessageForm'),
    worldMessageInput: document.getElementById('worldMessageInput'),
    mentionBotBtn: document.getElementById('mentionBotBtn'),

    // Direct Chat
    directRecipientAvatar: document.getElementById('directRecipientAvatar'),
    directRecipientName: document.getElementById('directRecipientName'),
    directRecipientProfession: document.getElementById('directRecipientProfession'),
    directRecipientStatus: document.getElementById('directRecipientStatus'),
    directRecipientSkills: document.getElementById('directRecipientSkills'),
    viewRecipientBioBtn: document.getElementById('viewRecipientBioBtn'),
    directMessagesList: document.getElementById('directMessagesList'),
    directMessageForm: document.getElementById('directMessageForm'),
    directMessageInput: document.getElementById('directMessageInput'),

    // Directory
    popularProfessionTags: document.getElementById('popularProfessionTags'),
    professionDirectoryList: document.getElementById('professionDirectoryList'),

    // Auth Modal
    authModal: document.getElementById('authModal'),
    tabSignIn: document.getElementById('tabSignIn'),
    tabRegister: document.getElementById('tabRegister'),
    signInForm: document.getElementById('signInForm'),
    registerForm: document.getElementById('registerForm'),
    authAlert: document.getElementById('authAlert'),

    // Bio Modal
    userBioModal: document.getElementById('userBioModal'),
    bioModalAvatar: document.getElementById('bioModalAvatar'),
    bioModalName: document.getElementById('bioModalName'),
    bioModalProfession: document.getElementById('bioModalProfession'),
    bioModalSkills: document.getElementById('bioModalSkills'),
    bioModalAbout: document.getElementById('bioModalAbout'),
    bioModalChatBtn: document.getElementById('bioModalChatBtn'),
    closeBioModalBtn: document.getElementById('closeBioModalBtn')
  };

  // Helper: Format Dates
  function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return timeStr;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Show Alert in Auth Modal
  function showAuthAlert(msg) {
    elements.authAlert.textContent = msg;
    elements.authAlert.className = 'alert-box alert-error';
    elements.authAlert.classList.remove('hidden');
  }

  function hideAuthAlert() {
    elements.authAlert.classList.add('hidden');
  }

  // ================= INITIALIZATION & AUTH =================
  async function initApp() {
    try {
      const user = await API.getMe();
      handleAuthSuccess(user);
    } catch (err) {
      handleLoggedOut();
    }
  }

  function handleAuthSuccess(user) {
    state.currentUser = user;

    // Update Header UI
    elements.headerAvatar.textContent = user.display_name.charAt(0).toUpperCase();
    elements.headerAvatar.style.backgroundColor = user.avatar_color || '#3b82f6';
    elements.headerDisplayName.textContent = user.display_name;
    elements.headerProfession.textContent = user.profession;

    elements.userProfileHeader.classList.remove('hidden');
    elements.guestHeaderActions.classList.add('hidden');
    elements.authModal.classList.add('hidden');

    // Connect to WebSocket with token
    socketClient.connect(API.getToken());

    // Switch to World Chat and load data
    switchView('world');
    loadWorldMessages();
    loadConversations();
  }

  function handleLoggedOut() {
    state.currentUser = null;
    socketClient.disconnect();

    elements.userProfileHeader.classList.add('hidden');
    elements.guestHeaderActions.classList.remove('hidden');
    elements.authModal.classList.remove('hidden');
  }

  // ================= VIEW SWITCHING =================
  function switchView(viewName) {
    state.currentView = viewName;

    elements.worldChatView.classList.remove('active');
    elements.directChatView.classList.remove('active');
    elements.discoverView.classList.remove('active');

    elements.navWorldChat.classList.remove('active');
    elements.navDiscover.classList.remove('active');
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));

    if (viewName === 'world') {
      elements.worldChatView.classList.add('active');
      elements.navWorldChat.classList.add('active');
      setTimeout(() => elements.worldMessageInput.focus(), 100);
    } else if (viewName === 'direct') {
      elements.directChatView.classList.add('active');
      if (state.activeDirectUser) {
        const activeItem = document.getElementById(`conv-item-${state.activeDirectUser.id}`);
        if (activeItem) activeItem.classList.add('active');
      }
      setTimeout(() => elements.directMessageInput.focus(), 100);
    } else if (viewName === 'discover') {
      elements.discoverView.classList.add('active');
      elements.navDiscover.classList.add('active');
      loadProfessionDirectory('');
    }
  }

  // ================= WORLD CHAT =================
  async function loadWorldMessages() {
    elements.worldMessagesList.innerHTML = '<div class="loading-spinner">Loading messages...</div>';
    try {
      const messages = await API.getWorldMessages();
      elements.worldMessagesList.innerHTML = '';
      if (messages.length === 0) {
        elements.worldMessagesList.innerHTML = '<div class="empty-state-small">Welcome to the World Chat! Be the first to share knowledge.</div>';
        return;
      }
      messages.forEach(msg => appendWorldMessage(msg, false));
      scrollWorldToBottom();
    } catch (err) {
      elements.worldMessagesList.innerHTML = '<div class="empty-state-small">Error loading world messages.</div>';
    }
  }

  function appendWorldMessage(msg, shouldScroll = true) {
    const isSelf = state.currentUser && state.currentUser.id === msg.sender_id;
    const initial = (msg.display_name || msg.username || 'U').charAt(0).toUpperCase();

    const row = document.createElement('div');
    row.className = 'message-row';

    row.innerHTML = `
      <div class="avatar message-avatar" style="background-color: ${msg.avatar_color || '#3b82f6'}" title="View profile">
        ${initial}
      </div>
      <div class="message-body">
        <div class="message-meta">
          <span class="message-sender">${escapeHtml(msg.display_name || msg.username)}</span>
          <span class="user-role-badge">${escapeHtml(msg.profession || 'Professional')}</span>
          <span class="message-time">${formatTime(msg.created_at)}</span>
        </div>
        <div class="message-content">${escapeHtml(msg.content)}</div>
      </div>
    `;

    // Click on avatar or sender name to view profile and message
    const avatarEl = row.querySelector('.message-avatar');
    const senderEl = row.querySelector('.message-sender');
    const openUser = () => {
      openBioModal({
        id: msg.sender_id,
        display_name: msg.display_name,
        username: msg.username,
        profession: msg.profession,
        avatar_color: msg.avatar_color
      });
    };
    avatarEl.addEventListener('click', openUser);
    senderEl.addEventListener('click', openUser);

    elements.worldMessagesList.appendChild(row);
    if (shouldScroll) scrollWorldToBottom();
  }

  function scrollWorldToBottom() {
    elements.worldMessagesList.scrollTop = elements.worldMessagesList.scrollHeight;
  }

  // ================= DIRECT CHAT =================
  async function openDirectChat(targetUser) {
    if (!targetUser || !state.currentUser) return;
    if (targetUser.id === state.currentUser.id) return;

    state.activeDirectUser = targetUser;
    switchView('direct');

    // Update Header
    elements.directRecipientAvatar.textContent = (targetUser.display_name || 'U').charAt(0).toUpperCase();
    elements.directRecipientAvatar.style.backgroundColor = targetUser.avatar_color || '#3b82f6';
    elements.directRecipientName.textContent = targetUser.display_name || targetUser.username;
    elements.directRecipientProfession.textContent = targetUser.profession || 'Professional';
    elements.directRecipientSkills.textContent = targetUser.skills ? `Skills: ${targetUser.skills}` : '';

    updateRecipientPresence();

    // Mark messages as read via socket
    socketClient.markRead(targetUser.id);

    // Load Messages
    elements.directMessagesList.innerHTML = '<div class="loading-spinner">Loading conversation...</div>';
    try {
      const messages = await API.getDirectMessages(targetUser.id);
      elements.directMessagesList.innerHTML = '';
      if (messages.length === 0) {
        elements.directMessagesList.innerHTML = `
          <div class="empty-state-small">
            This is the start of your direct personal conversation with <strong>${escapeHtml(targetUser.display_name)}</strong>.<br>
            All text messages are saved securely.
          </div>
        `;
      } else {
        messages.forEach(msg => appendDirectMessage(msg, false));
      }
      scrollDirectToBottom();
      loadConversations(); // refresh unread badges
    } catch (err) {
      elements.directMessagesList.innerHTML = '<div class="empty-state-small">Failed to load conversation.</div>';
    }
  }

  function appendDirectMessage(msg, shouldScroll = true) {
    const isOutgoing = state.currentUser && msg.sender_id === state.currentUser.id;

    const row = document.createElement('div');
    row.className = `direct-message-row ${isOutgoing ? 'outgoing' : 'incoming'}`;

    row.innerHTML = `
      <div class="direct-bubble">${escapeHtml(msg.content)}</div>
      <div class="direct-meta">
        <span>${formatTime(msg.created_at)}</span>
        ${isOutgoing ? `<span style="margin-left:4px;">${msg.is_read ? '✓✓' : '✓'}</span>` : ''}
      </div>
    `;

    elements.directMessagesList.appendChild(row);
    if (shouldScroll) scrollDirectToBottom();
  }

  function scrollDirectToBottom() {
    elements.directMessagesList.scrollTop = elements.directMessagesList.scrollHeight;
  }

  function updateRecipientPresence() {
    if (!state.activeDirectUser) return;
    const isOnline = state.onlineUserIds.has(state.activeDirectUser.id);
    if (isOnline) {
      elements.directRecipientStatus.className = 'status-indicator';
      elements.directRecipientStatus.innerHTML = '<span class="dot"></span> Online';
    } else {
      elements.directRecipientStatus.className = 'status-indicator offline';
      elements.directRecipientStatus.innerHTML = '<span class="dot"></span> Offline';
    }
  }

  // ================= CONVERSATIONS LIST =================
  async function loadConversations() {
    if (!state.currentUser) return;
    try {
      const list = await API.getConversations();
      state.conversations = list;
      renderConversationsList();
    } catch (err) {
      console.warn('Failed to fetch conversations:', err);
    }
  }

  function renderConversationsList() {
    elements.conversationsList.innerHTML = '';
    elements.conversationCount.textContent = state.conversations.length;

    if (state.conversations.length === 0) {
      elements.conversationsList.innerHTML = '<div class="empty-state-small">No direct conversations yet. Search professionals to connect!</div>';
      return;
    }

    state.conversations.forEach(conv => {
      const item = document.createElement('div');
      item.id = `conv-item-${conv.id}`;
      item.className = 'conversation-item';
      if (state.currentView === 'direct' && state.activeDirectUser && state.activeDirectUser.id === conv.id) {
        item.classList.add('active');
      }

      const initial = (conv.display_name || conv.username || 'U').charAt(0).toUpperCase();
      const isOnline = state.onlineUserIds.has(conv.id);

      item.innerHTML = `
        <div class="avatar" style="background-color: ${conv.avatar_color || '#3b82f6'}; position: relative;">
          ${initial}
          ${isOnline ? '<span class="dot" style="position:absolute; bottom:0; right:0; border:2px solid var(--bg-secondary);"></span>' : ''}
        </div>
        <div class="conversation-details">
          <div class="conversation-top">
            <span class="conversation-name">${escapeHtml(conv.display_name)}</span>
            <span class="conversation-time">${formatTime(conv.last_message_time)}</span>
          </div>
          <div class="conversation-profession">${escapeHtml(conv.profession)}</div>
          <div class="conversation-preview">${escapeHtml(conv.last_message || '')}</div>
        </div>
        ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
      `;

      item.addEventListener('click', () => {
        openDirectChat({
          id: conv.id,
          display_name: conv.display_name,
          username: conv.username,
          profession: conv.profession,
          avatar_color: conv.avatar_color
        });
      });

      elements.conversationsList.appendChild(item);
    });
  }

  // ================= PROFESSION DIRECTORY / SEARCH =================
  async function loadProfessionDirectory(query = '') {
    elements.professionDirectoryList.innerHTML = '<div class="loading-spinner">Searching specialists & professionals...</div>';
    try {
      const users = await API.searchUsers(query);
      elements.professionDirectoryList.innerHTML = '';

      if (users.length === 0) {
        elements.professionDirectoryList.innerHTML = `
          <div class="empty-state-small" style="grid-column: 1 / -1;">
            No professionals found matching "<strong>${escapeHtml(query)}</strong>".<br>
            Try searching for another profession, skill, or name!
          </div>
        `;
        return;
      }

      users.forEach(u => {
        const isOnline = state.onlineUserIds.has(u.id);
        const card = document.createElement('div');
        card.className = 'user-card';

        const initial = (u.display_name || u.username || 'U').charAt(0).toUpperCase();
        const skillsArray = (u.skills || '').split(',').map(s => s.trim()).filter(Boolean);

        card.innerHTML = `
          <div class="user-card-header">
            <div class="avatar" style="background-color: ${u.avatar_color || '#3b82f6'}; font-size:1.1rem; width:44px; height:44px;">
              ${initial}
            </div>
            <div class="user-card-names">
              <div class="user-card-displayname">${escapeHtml(u.display_name)}</div>
              <div class="user-card-username">@${escapeHtml(u.username)}</div>
              <div class="user-card-badge">
                <span class="user-role-badge">${escapeHtml(u.profession)}</span>
              </div>
            </div>
          </div>

          <p class="user-card-bio">${escapeHtml(u.bio || 'Professional open for networking and information exchange.')}</p>

          <div class="skills-chips">
            ${skillsArray.length ? skillsArray.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('') : '<span class="skill-tag">Expertise</span>'}
          </div>

          <div class="user-card-footer">
            <div class="user-online-status">
              <span class="dot" style="background-color: ${isOnline ? 'var(--accent-green)' : 'var(--text-dim)'};"></span>
              <span>${isOnline ? 'Online now' : 'Offline'}</span>
            </div>
            <button class="btn btn-primary btn-sm start-chat-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Chat
            </button>
          </div>
        `;

        card.querySelector('.start-chat-btn').addEventListener('click', () => {
          openDirectChat(u);
        });

        elements.professionDirectoryList.appendChild(card);
      });
    } catch (err) {
      elements.professionDirectoryList.innerHTML = '<div class="empty-state-small" style="grid-column: 1 / -1;">Failed to load directory.</div>';
    }
  }

  // ================= BIO MODAL =================
  async function openBioModal(userSnippet) {
    try {
      const fullUser = await API.getUser(userSnippet.id);
      elements.bioModalAvatar.textContent = fullUser.display_name.charAt(0).toUpperCase();
      elements.bioModalAvatar.style.backgroundColor = fullUser.avatar_color || '#3b82f6';
      elements.bioModalName.textContent = fullUser.display_name;
      elements.bioModalProfession.textContent = fullUser.profession;
      elements.bioModalAbout.textContent = fullUser.bio || 'No personal bio added.';

      const skillsArray = (fullUser.skills || '').split(',').map(s => s.trim()).filter(Boolean);
      elements.bioModalSkills.innerHTML = skillsArray.length
        ? skillsArray.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')
        : '<span class="skill-tag">General</span>';

      elements.bioModalChatBtn.onclick = () => {
        elements.userBioModal.classList.add('hidden');
        openDirectChat(fullUser);
      };

      elements.userBioModal.classList.remove('hidden');
    } catch (err) {
      console.warn('Could not load user bio:', err);
    }
  }

  // ================= SOCKET EVENT HANDLERS =================
  socketClient.onPresenceUpdate((onlineIds) => {
    state.onlineUserIds = onlineIds;
    elements.onlineCountText.textContent = `${onlineIds.size} Online`;
    updateRecipientPresence();
    renderConversationsList();
  });

  socketClient.onWorldMessage((msg) => {
    appendWorldMessage(msg, true);
  });

  socketClient.onDirectMessage((msg) => {
    const isCurrentChat = state.currentView === 'direct' && 
      state.activeDirectUser && 
      (msg.sender_id === state.activeDirectUser.id || msg.recipient_id === state.activeDirectUser.id);

    if (isCurrentChat) {
      appendDirectMessage(msg, true);
      if (msg.recipient_id === state.currentUser.id) {
        socketClient.markRead(state.activeDirectUser.id);
      }
    }

    // Refresh conversation list to show latest snippet and unread badges
    loadConversations();
  });

  socketClient.onMessagesRead((data) => {
    if (state.currentView === 'direct' && state.activeDirectUser && state.activeDirectUser.id === data.readByUserId) {
      // Update checkmarks to read
      document.querySelectorAll('.direct-message-row.outgoing .direct-meta span:last-child').forEach(el => {
        el.textContent = '✓✓';
      });
    }
  });

  // ================= EVENT LISTENERS =================

  // Auth Forms
  elements.tabSignIn.addEventListener('click', () => {
    elements.tabSignIn.classList.add('active');
    elements.tabRegister.classList.remove('active');
    elements.signInForm.classList.remove('hidden');
    elements.registerForm.classList.add('hidden');
    hideAuthAlert();
  });

  elements.tabRegister.addEventListener('click', () => {
    elements.tabRegister.classList.add('active');
    elements.tabSignIn.classList.remove('active');
    elements.registerForm.classList.remove('hidden');
    elements.signInForm.classList.add('hidden');
    hideAuthAlert();
  });

  elements.signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const user = await API.login(username, password);
      handleAuthSuccess(user);
    } catch (err) {
      showAuthAlert(err.message || 'Login failed. Please check credentials.');
    }
  });

  elements.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();
    const display_name = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const profession = document.getElementById('regProfession').value.trim();
    const skills = document.getElementById('regSkills').value.trim();
    const bio = document.getElementById('regBio').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
      const user = await API.register({
        display_name,
        username,
        profession,
        skills,
        bio,
        password
      });
      handleAuthSuccess(user);
    } catch (err) {
      showAuthAlert(err.message || 'Registration failed.');
    }
  });

  elements.logoutBtn.addEventListener('click', async () => {
    await API.logout();
    handleLoggedOut();
  });

  elements.openAuthModalBtn.addEventListener('click', () => {
    elements.authModal.classList.remove('hidden');
  });

  // Navigation
  elements.navWorldChat.addEventListener('click', () => switchView('world'));
  elements.navDiscover.addEventListener('click', () => switchView('discover'));

  // World Message Submit
  if (elements.mentionBotBtn) {
    elements.mentionBotBtn.addEventListener('click', () => {
      const input = elements.worldMessageInput;
      if (!input.value.includes('@probot')) {
        input.value = '@probot ' + input.value;
      }
      input.focus();
    });
  }

  elements.worldMessageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = elements.worldMessageInput.value.trim();
    if (!content) return;
    socketClient.sendWorldMessage(content);
    elements.worldMessageInput.value = '';
    elements.worldMessageInput.focus();
  });

  // Direct Message Submit
  elements.directMessageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeDirectUser) return;
    const content = elements.directMessageInput.value.trim();
    if (!content) return;
    socketClient.sendDirectMessage(state.activeDirectUser.id, content);
    elements.directMessageInput.value = '';
    elements.directMessageInput.focus();
  });

  // Global Header Search
  elements.globalSearchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
      elements.clearSearchBtn.classList.remove('hidden');
    } else {
      elements.clearSearchBtn.classList.add('hidden');
    }

    clearTimeout(state.searchDebounceTimer);
    state.searchDebounceTimer = setTimeout(() => {
      switchView('discover');
      loadProfessionDirectory(val);
    }, 250);
  });

  elements.clearSearchBtn.addEventListener('click', () => {
    elements.globalSearchInput.value = '';
    elements.clearSearchBtn.classList.add('hidden');
    loadProfessionDirectory('');
  });

  // Quick Filter Chips in Discover view
  elements.popularProfessionTags.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;

    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const filterVal = chip.getAttribute('data-filter');
    elements.globalSearchInput.value = filterVal;
    if (filterVal) {
      elements.clearSearchBtn.classList.remove('hidden');
    } else {
      elements.clearSearchBtn.classList.add('hidden');
    }
    loadProfessionDirectory(filterVal);
  });

  // Profile Bio Modal Close
  elements.closeBioModalBtn.addEventListener('click', () => {
    elements.userBioModal.classList.add('hidden');
  });

  elements.viewRecipientBioBtn.addEventListener('click', () => {
    if (state.activeDirectUser) {
      openBioModal(state.activeDirectUser);
    }
  });

  // Initial Run
  initApp();

})();

