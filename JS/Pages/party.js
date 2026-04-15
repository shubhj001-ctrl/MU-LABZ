/**
 * Pages/party.js — Party Room page renderer
 *
 * Displays the party room interface with:
 * - Player controls (for DJs)
 * - Bucket list
 * - User list
 * - Chat
 */

const PartyPage = (() => {
  let currentRoom = null;
  let listeners = {};

  async function render(container, params = {}) {
    container.innerHTML = '';

    // Clean up old listeners
    Object.values(listeners).forEach(listener => {
      document.removeEventListener(listener.event, listener.handler);
    });
    listeners = {};

    // If we have a roomId in params, join that room
    if (params.roomId) {
      _showPartyInterface(container, params.roomId);
    } else if (PartyRoom.getState().roomId) {
      // Already in a room
      _showPartyInterface(container, PartyRoom.getState().roomId);
    } else {
      // Not in a room, show entry interface
      _showPartyEntry(container);
    }
  }

  function _showPartyEntry(container) {
    container.innerHTML = `
      <div class="party-entry-container">
        <div class="party-entry-header">
          <h1>🎉 Party Room</h1>
          <p>Listen together, create together</p>
        </div>

        <div class="party-entry-options">
          <button class="party-entry-btn create-room-btn">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="1"/>
              <path d="M12 8v8M8 12h8"/>
              <circle cx="12" cy="12" r="9"/>
            </svg>
            Create Room
          </button>

          <button class="party-entry-btn join-room-btn">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Join Room
          </button>
        </div>
      </div>
    `;

    const createBtn = container.querySelector('.create-room-btn');
    const joinBtn = container.querySelector('.join-room-btn');

    createBtn.addEventListener('click', () => _showCreateRoomModal(container));
    joinBtn.addEventListener('click', () => _showJoinRoomModal(container));
  }

  function _showCreateRoomModal(container) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <h2>Create Party Room</h2>

        <div class="form-group">
          <label>Party Name</label>
          <input type="text" id="party-name-input" placeholder="How do you want to be called?" maxlength="50">
        </div>

        <div class="form-group">
          <label>Room Name</label>
          <input type="text" id="room-name-input" placeholder="e.g., Chill Vibes Session" maxlength="100">
        </div>

        <div class="form-group">
          <label>Max Users</label>
          <input type="number" id="max-users-input" min="2" max="100" value="10">
        </div>

        <div class="form-group">
          <label>Room Type</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="room-type" value="public" checked>
              <span>Public (Join request required)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="room-type" value="private">
              <span>Private (Password protected)</span>
            </label>
          </div>
        </div>

        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" placeholder="Set a password" maxlength="50">
        </div>

        <div class="modal-actions">
          <button class="btn-secondary cancel-btn">Cancel</button>
          <button class="btn-primary create-btn">Create</button>
        </div>
      </div>
    `;

    container.appendChild(modal);

    // Show password field when private is selected
    const roomTypeInputs = modal.querySelectorAll('input[name="room-type"]');
    const passwordGroup = modal.querySelector('#password-group');
    roomTypeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        passwordGroup.style.display = e.target.value === 'private' ? 'block' : 'none';
      });
    });

    modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());

    modal.querySelector('.create-btn').addEventListener('click', () => {
      const partyName = modal.querySelector('#party-name-input').value.trim();
      const roomName = modal.querySelector('#room-name-input').value.trim();
      const maxUsers = parseInt(modal.querySelector('#max-users-input').value) || 10;
      const roomType = modal.querySelector('input[name="room-type"]:checked').value;
      const password = roomType === 'private' ? modal.querySelector('#password-input').value : null;

      if (!partyName || !roomName) {
        showToast('Please fill in all fields');
        return;
      }

      PartyRoom.setPartyName(partyName);
      PartyRoom.init();
      PartyRoom.createRoom(roomName, maxUsers, roomType, password);

      // Listen for room created event
      const handler = () => {
        document.removeEventListener('party:roomCreated', handler);
        Router.navigate('party', { roomId: PartyRoom.getState().roomId });
        modal.remove();
      };
      document.addEventListener('party:roomCreated', handler);
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showJoinRoomModal(container) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <h2>Join Party Room</h2>

        <div class="form-group">
          <label>Party Name</label>
          <input type="text" id="party-name-input" placeholder="How do you want to be called?" maxlength="50">
        </div>

        <div class="form-group">
          <label>Room Code or Link</label>
          <input type="text" id="room-id-input" placeholder="Paste room code or link" maxlength="100">
        </div>

        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" placeholder="Enter room password" maxlength="50">
        </div>

        <p class="form-hint">Room code looks like: <code>6a3f9c2b</code></p>

        <div class="modal-actions">
          <button class="btn-secondary cancel-btn">Cancel</button>
          <button class="btn-primary join-btn">Join</button>
        </div>
      </div>
    `;

    container.appendChild(modal);

    modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());

    modal.querySelector('.join-btn').addEventListener('click', () => {
      const partyName = modal.querySelector('#party-name-input').value.trim();
      let roomId = modal.querySelector('#room-id-input').value.trim();

      if (!partyName || !roomId) {
        showToast('Please fill in all fields');
        return;
      }

      // Extract room ID from link if it's a full URL
      if (roomId.includes('#party/')) {
        roomId = roomId.split('#party/')[1].split('?')[0];
      }

      const password = modal.querySelector('#password-input').value || null;

      PartyRoom.setPartyName(partyName);
      PartyRoom.init();
      PartyRoom.joinRoom(roomId, password);

      // Listen for room joined event
      const handler = () => {
        document.removeEventListener('party:roomJoined', handler);
        Router.navigate('party', { roomId: roomId });
        modal.remove();
      };
      document.addEventListener('party:roomJoined', handler);

      // Handle join errors/rejection
      const errorHandler = (e) => {
        if (e.detail && e.detail.type === 'JOIN_FAILED') {
          showToast('Failed to join room: ' + (e.detail.message || 'Unknown error'));
          document.removeEventListener('party:error', errorHandler);
          modal.remove();
        }
      };
      document.addEventListener('party:error', errorHandler);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showPartyInterface(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    container.innerHTML = `
      <div class="party-room-container">
        <!-- Header -->
        <div class="party-header">
          <div class="party-title">
            <h1>${state.roomName}</h1>
            <p class="room-code">Code: <code>${(roomId || state.roomId).substring(0, 8)}</code></p>
          </div>
          <button class="party-leave-btn">Leave</button>
        </div>

        <!-- Main content -->
        <div class="party-main">
          <!-- Center: Player -->
          <div class="party-center">
            <div class="party-player">
              ${state.currentSong ? `
                <div class="party-now-playing">
                  <div class="now-playing-cover">
                    <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'">
                  </div>
                  <div class="now-playing-info">
                    <h2>${state.currentSong.title}</h2>
                    <p>${state.currentSong.artist}</p>
                  </div>
                </div>
              ` : `
                <div class="party-no-song">
                  <p>No song playing yet</p>
                </div>
              `}

              ${isDJ ? `
                <div class="party-controls-dj">
                  <button class="btn-control" id="party-prev-btn" title="Previous">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6z"/><path d="M9 6l9 6-9 6z"/>
                    </svg>
                  </button>
                  <button class="btn-control btn-control-large" id="party-play-btn" title="Play/Pause">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                  <button class="btn-control" id="party-next-btn" title="Next">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 18h2V6h-2z"/><path d="M15 18L6 12l9-6z"/>
                    </svg>
                  </button>
                </div>
              ` : ''}

              <div class="party-progress">
                <div class="progress-bar">
                  <div class="progress-fill"></div>
                </div>
                <div class="progress-time">
                  <span id="party-time-cur">0:00</span>
                  <span id="party-time-total">0:00</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Side panels -->
          <div class="party-sides">
            <!-- Left: Users & Bucket -->
            <div class="party-panel party-panel-left">
              <div class="party-users-section">
                <h3>Users (${state.users.length + state.djs.length})</h3>
                <div class="party-users-list">
                  ${state.djs.map(u => `
                    <div class="party-user dj">
                      <span class="user-role">👑</span>
                      <span>${u.partyName}</span>
                    </div>
                  `).join('')}
                  ${state.users.map(u => `
                    <div class="party-user">
                      <span class="user-role"></span>
                      <span>${u.partyName}</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="party-bucket-section">
                <h3>Bucket List (${state.bucket.length})</h3>
                <div class="bucket-search">
                  <input type="text" id="bucket-search-input" placeholder="Search & add...">
                  <button id="bucket-search-btn">+</button>
                </div>
                <div class="party-bucket-list" id="party-bucket-list">
                  ${state.bucket.length === 0 ? `
                    <p class="empty-message">No songs in bucket yet</p>
                  ` : state.bucket.map((item, idx) => `
                    <div class="bucket-item">
                      <div class="bucket-item-info">
                        <p class="bucket-item-title">${escapeHtml(item.title)}</p>
                        <p class="bucket-item-artist">${escapeHtml(item.artist)}</p>
                        <p class="bucket-item-by">Added by ${escapeHtml(item.addedBy)}</p>
                      </div>
                      <div class="bucket-item-actions">
                        ${isDJ ? `
                          <button class="btn-small play-bucket-btn" data-song-id="${escapeHtml(item.songId)}" title="Play">▶️</button>
                          <button class="btn-small remove-bucket-btn" data-song-id="${escapeHtml(item.songId)}" title="Remove">✕</button>
                        ` : `
                          <button class="btn-small remove-bucket-btn" data-song-id="${escapeHtml(item.songId)}" title="Remove">✕</button>
                        `}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Right: Chat -->
            <div class="party-panel party-panel-right">
              <h3>Chat</h3>
              <div class="party-chat-messages" id="party-chat-messages">
                ${state.messages.length === 0 ? `<p class="empty-message">No messages yet</p>` : ''}
                ${state.messages.map(msg => `
                  <div class="chat-message">
                    <p class="chat-author">${escapeHtml(msg.partyName)}</p>
                    <p class="chat-text">${escapeHtml(msg.text)}</p>
                  </div>
                `).join('')}
              </div>
              <div class="party-chat-input">
                <input type="text" id="party-chat-input" placeholder="Say something..." maxlength="200">
                <button id="party-chat-send-btn">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    _attachPartyEventListeners(container, roomId || state.roomId);
  }

  function _attachPartyEventListeners(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    // Leave button
    container.querySelector('.party-leave-btn')?.addEventListener('click', () => {
      if (confirm('Leave this party room?')) {
        PartyRoom.leaveRoom();
        Router.navigate('home');
      }
    });

    // DJ controls
    if (isDJ) {
      container.querySelector('#party-play-btn')?.addEventListener('click', () => {
        if (state.isPlaying) {
          PartyRoom.pausePlayback();
        } else if (state.currentSong) {
          PartyRoom.resumePlayback();
        }
      });

      container.querySelector('#party-next-btn')?.addEventListener('click', () => {
        PartyRoom.skipToNext();
      });
    }

    // Bucket search & add
    const bucketSearchInput = container.querySelector('#bucket-search-input');
    const bucketSearchBtn = container.querySelector('#bucket-search-btn');

    bucketSearchBtn?.addEventListener('click', async () => {
      const query = bucketSearchInput.value.trim();
      if (!query) return;

      showToast('Searching...');
      try {
        const results = await API.search(query, 5);
        if (!results || results.length === 0) {
          showToast('No songs found');
          return;
        }

        const track = results[0];
        PartyRoom.addToBucket(track);
        bucketSearchInput.value = '';
        showToast('Added to bucket 🎵');
      } catch (err) {
        showToast('Search failed');
      }
    });

    // Bucket item actions
    container.querySelectorAll('.play-bucket-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const songId = btn.dataset.songId;
        PartyRoom.playFromBucket(songId);
      });
    });

    container.querySelectorAll('.remove-bucket-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const songId = btn.dataset.songId;
        PartyRoom.removeFromBucket(songId);
      });
    });

    // Chat
    const chatInput = container.querySelector('#party-chat-input');
    const chatSendBtn = container.querySelector('#party-chat-send-btn');

    const sendMessage = () => {
      const text = chatInput.value.trim();
      if (text) {
        PartyRoom.sendMessage(text);
        chatInput.value = '';
      }
    };

    chatSendBtn?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });

    // Setup event listeners for real-time updates
    function handlePartyEvent(event, handler) {
      listeners[event] = { event, handler };
      document.addEventListener(event, handler);
    }

    handlePartyEvent('party:messageNew', (e) => {
      _updateChatUI(container, e.detail);
    });

    handlePartyEvent('party:bucketAdd', (e) => {
      _updateBucketUI(container);
    });

    handlePartyEvent('party:bucketRemove', (e) => {
      _updateBucketUI(container);
    });

    handlePartyEvent('party:userJoined', (e) => {
      _updateUsersUI(container);
    });

    handlePartyEvent('party:userLeft', (e) => {
      _updateUsersUI(container);
    });

    handlePartyEvent('party:next', (e) => {
      _updatePlayerUI(container);
    });

    handlePartyEvent('party:play', (e) => {
      _updatePlayerUI(container);
    });

    handlePartyEvent('party:pause', (e) => {
      _updatePlayerUI(container);
    });
  }

  function _updatePlayerUI(container) {
    const state = PartyRoom.getState();
    const player = container.querySelector('.party-now-playing');
    if (!player) return;

    if (state.currentSong) {
      player.innerHTML = `
        <div class="now-playing-cover">
          <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover">
        </div>
        <div class="now-playing-info">
          <h2>${escapeHtml(state.currentSong.title)}</h2>
          <p>${escapeHtml(state.currentSong.artist)}</p>
        </div>
      `;
    } else {
      const noSong = container.querySelector('.party-no-song');
      if (noSong) {
        noSong.innerHTML = '<p>No song playing yet</p>';
      }
    }
  }

  function _updateBucketUI(container) {
    const state = PartyRoom.getState();
    const list = container.querySelector('#party-bucket-list');
    if (!list) return;

    const isDJ = state.role === 'dj';

    if (state.bucket.length === 0) {
      list.innerHTML = '<p class="empty-message">No songs in bucket yet</p>';
      return;
    }

    list.innerHTML = state.bucket.map((item) => `
      <div class="bucket-item">
        <div class="bucket-item-info">
          <p class="bucket-item-title">${escapeHtml(item.title)}</p>
          <p class="bucket-item-artist">${escapeHtml(item.artist)}</p>
          <p class="bucket-item-by">Added by ${escapeHtml(item.addedBy)}</p>
        </div>
        <div class="bucket-item-actions">
          ${isDJ ? `
            <button class="btn-small play-bucket-btn" data-song-id="${escapeHtml(item.songId)}" title="Play">▶️</button>
            <button class="btn-small remove-bucket-btn" data-song-id="${escapeHtml(item.songId)}" title="Remove">✕</button>
          ` : `
            <button class="btn-small remove-bucket-btn" data-song-id="${escapeHtml(item.songId)}" title="Remove">✕</button>
          `}
        </div>
      </div>
    `).join('');

    // Re-attach event listeners
    list.querySelectorAll('.play-bucket-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PartyRoom.playFromBucket(btn.dataset.songId);
      });
    });

    list.querySelectorAll('.remove-bucket-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PartyRoom.removeFromBucket(btn.dataset.songId);
      });
    });

    // Update count
    const section = container.querySelector('.party-bucket-section h3');
    if (section) {
      section.textContent = `Bucket List (${state.bucket.length})`;
    }
  }

  function _updateChatUI(container, message) {
    const messages = container.querySelector('#party-chat-messages');
    if (!messages) return;

    // Remove empty message if present
    const emptyMsg = messages.querySelector('.empty-message');
    if (emptyMsg) emptyMsg.remove();

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.innerHTML = `
      <p class="chat-author">${escapeHtml(message.partyName)}</p>
      <p class="chat-text">${escapeHtml(message.text)}</p>
    `;
    messages.appendChild(msgEl);

    // Auto-scroll to bottom
    messages.scrollTop = messages.scrollHeight;
  }

  function _updateUsersUI(container) {
    const state = PartyRoom.getState();
    const list = container.querySelector('.party-users-list');
    if (!list) return;

    list.innerHTML = `
      ${state.djs.map(u => `
        <div class="party-user dj">
          <span class="user-role">👑</span>
          <span>${escapeHtml(u.partyName)}</span>
        </div>
      `).join('')}
      ${state.users.map(u => `
        <div class="party-user">
          <span class="user-role"></span>
          <span>${escapeHtml(u.partyName)}</span>
        </div>
      `).join('')}
    `;

    // Update count
    const header = container.querySelector('.party-users-section h3');
    if (header) {
      header.textContent = `Users (${state.users.length + state.djs.length})`;
    }
  }

  return { render };
})();

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

  function _showCreateRoomModal(container) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <h2>Create Party Room</h2>

        <div class="form-group">
          <label>Party Name</label>
          <input type="text" id="party-name-input" placeholder="How do you want to be called?" maxlength="50">
        </div>

        <div class="form-group">
          <label>Room Name</label>
          <input type="text" id="room-name-input" placeholder="e.g., Chill Vibes Session" maxlength="100">
        </div>

        <div class="form-group">
          <label>Max Users</label>
          <input type="number" id="max-users-input" min="2" max="100" value="10">
        </div>

        <div class="form-group">
          <label>Room Type</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="room-type" value="public" checked>
              <span>Public (Join request required)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="room-type" value="private">
              <span>Private (Password protected)</span>
            </label>
          </div>
        </div>

        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" placeholder="Set a password" maxlength="50">
        </div>

        <div class="modal-actions">
          <button class="btn-secondary cancel-btn">Cancel</button>
          <button class="btn-primary create-btn">Create</button>
        </div>
      </div>
    `;

    container.appendChild(modal);

    // Show password field when private is selected
    const roomTypeInputs = modal.querySelectorAll('input[name="room-type"]');
    const passwordGroup = modal.querySelector('#password-group');
    roomTypeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        passwordGroup.style.display = e.target.value === 'private' ? 'block' : 'none';
      });
    });

    modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());

    modal.querySelector('.create-btn').addEventListener('click', () => {
      const partyName = modal.querySelector('#party-name-input').value.trim();
      const roomName = modal.querySelector('#room-name-input').value.trim();
      const maxUsers = parseInt(modal.querySelector('#max-users-input').value) || 10;
      const roomType = modal.querySelector('input[name="room-type"]:checked').value;
      const password = roomType === 'private' ? modal.querySelector('#password-input').value : null;

      if (!partyName || !roomName) {
        showToast('Please fill in all fields');
        return;
      }

      PartyRoom.setPartyName(partyName);
      PartyRoom.init();
      PartyRoom.createRoom(roomName, maxUsers, roomType, password);

      // Listen for room created event
      document.addEventListener('party:roomCreated', function onCreated() {
        document.removeEventListener('party:roomCreated', onCreated);
        router_navigate_to_party(PartyRoom.getState().roomId);
        modal.remove();
      });
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showJoinRoomModal(container) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <h2>Join Party Room</h2>

        <div class="form-group">
          <label>Party Name</label>
          <input type="text" id="party-name-input" placeholder="How do you want to be called?" maxlength="50">
        </div>

        <div class="form-group">
          <label>Room Code or Link</label>
          <input type="text" id="room-id-input" placeholder="Paste room code or link" maxlength="100">
        </div>

        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" placeholder="Enter room password" maxlength="50">
        </div>

        <p class="form-hint">Room code looks like: <code>6a3f9c2b</code></p>

        <div class="modal-actions">
          <button class="btn-secondary cancel-btn">Cancel</button>
          <button class="btn-primary join-btn">Join</button>
        </div>
      </div>
    `;

    container.appendChild(modal);

    modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());

    modal.querySelector('.join-btn').addEventListener('click', () => {
      const partyName = modal.querySelector('#party-name-input').value.trim();
      let roomId = modal.querySelector('#room-id-input').value.trim();

      if (!partyName || !roomId) {
        showToast('Please fill in all fields');
        return;
      }

      // Extract room ID from link if it's a full URL
      if (roomId.includes('#party/')) {
        roomId = roomId.split('#party/')[1].split('?')[0];
      }

      const password = modal.querySelector('#password-input').value || null;

      PartyRoom.setPartyName(partyName);
      PartyRoom.init();
      PartyRoom.joinRoom(roomId, password);

      // Listen for room joined event
      document.addEventListener('party:roomJoined', function onJoined() {
        document.removeEventListener('party:roomJoined', onJoined);
        router_navigate_to_party(roomId);
        modal.remove();
      });

      // Handle join errors/rejection
      document.addEventListener('party:error', function onError(e) {
        if (e.detail.type === 'JOIN_FAILED') {
          showToast('Failed to join room: ' + (e.detail.message || 'Unknown error'));
          document.removeEventListener('party:error', onError);
          modal.remove();
        }
      });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showPartyInterface(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    container.innerHTML = `
      <div class="party-room-container">
        <!-- Header -->
        <div class="party-header">
          <div class="party-title">
            <h1>${state.roomName}</h1>
            <p class="room-code">Code: <code>${roomId.substring(0, 8)}</code></p>
          </div>
          <button class="party-leave-btn">Leave</button>
        </div>

        <!-- Main content -->
        <div class="party-main">
          <!-- Center: Player -->
          <div class="party-center">
            <div class="party-player">
              ${state.currentSong ? `
                <div class="party-now-playing">
                  <div class="now-playing-cover">
                    <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover">
                  </div>
                  <div class="now-playing-info">
                    <h2>${state.currentSong.title}</h2>
                    <p>${state.currentSong.artist}</p>
                  </div>
                </div>
              ` : `
                <div class="party-no-song">
                  <p>No song playing yet</p>
                </div>
              `}

              ${isDJ ? `
                <div class="party-controls-dj">
                  <button class="btn-control" id="party-prev-btn" title="Previous">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6z"/><path d="M9 6l9 6-9 6z"/>
                    </svg>
                  </button>
                  <button class="btn-control btn-control-large" id="party-play-btn" title="Play/Pause">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                  <button class="btn-control" id="party-next-btn" title="Next">
                    <path d="M16 18h2V6h-2z"/><path d="M15 18L6 12l9-6z"/>
                  </button>
                </div>
              ` : ''}

              <div class="party-progress">
                <div class="progress-bar">
                  <div class="progress-fill"></div>
                </div>
                <div class="progress-time">
                  <span id="party-time-cur">0:00</span>
                  <span id="party-time-total">0:00</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Side panels -->
          <div class="party-sides">
            <!-- Left: Users & Bucket -->
            <div class="party-panel party-panel-left">
              <div class="party-users-section">
                <h3>Users (${state.users.length + 1})</h3>
                <div class="party-users-list">
                  <div class="party-user dj">
                    <span class="user-role">👑</span>
                    <span>${state.users[0]?.partyName || 'Unknown'}</span>
                  </div>
                  ${state.users.map(u => `
                    <div class="party-user ${u.role === 'dj' ? 'dj' : ''}">
                      <span class="user-role">${u.role === 'dj' ? '👑' : ''}</span>
                      <span>${u.partyName}</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="party-bucket-section">
                <h3>Bucket List</h3>
                ${isDJ ? `
                  <div class="bucket-search">
                    <input type="text" id="bucket-search-input" placeholder="Add song...">
                    <button id="bucket-search-btn">+</button>
                  </div>
                ` : `
                  <div class="bucket-search">
                    <input type="text" id="bucket-search-input" placeholder="Search & add...">
                    <button id="bucket-search-btn">+</button>
                  </div>
                `}
                <div class="party-bucket-list" id="party-bucket-list">
                  ${state.bucket.length === 0 ? `
                    <p class="empty-message">No songs in bucket yet</p>
                  ` : state.bucket.map((item, idx) => `
                    <div class="bucket-item">
                      <div class="bucket-item-info">
                        <p class="bucket-item-title">${item.title}</p>
                        <p class="bucket-item-artist">${item.artist}</p>
                        <p class="bucket-item-by">Added by ${item.addedBy}</p>
                      </div>
                      <div class="bucket-item-actions">
                        ${isDJ ? `
                          <button class="btn-small play-bucket-btn" data-song-id="${item.songId}">▶️</button>
                          <button class="btn-small remove-bucket-btn" data-song-id="${item.songId}">✕</button>
                        ` : `
                          <button class="btn-small remove-bucket-btn" data-song-id="${item.songId}">✕</button>
                        `}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Right: Chat -->
            <div class="party-panel party-panel-right">
              <h3>Chat</h3>
              <div class="party-chat-messages" id="party-chat-messages">
                ${state.messages.length === 0 ? `<p class="empty-message">No messages yet</p>` : ''}
                ${state.messages.map(msg => `
                  <div class="chat-message">
                    <p class="chat-author">${msg.partyName}</p>
                    <p class="chat-text">${escapeHtml(msg.text)}</p>
                  </div>
                `).join('')}
              </div>
              <div class="party-chat-input">
                <input type="text" id="party-chat-input" placeholder="Say something..." maxlength="200">
                <button id="party-chat-send-btn">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    _attachPartyEventListeners(container, roomId);
  }

  function _attachPartyEventListeners(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    // Leave button
    container.querySelector('.party-leave-btn')?.addEventListener('click', () => {
      if (confirm('Leave this party room?')) {
        PartyRoom.leaveRoom();
        Router.navigate('home');
      }
    });

    // DJ controls
    if (isDJ) {
      container.querySelector('#party-play-btn')?.addEventListener('click', () => {
        if (state.isPlaying) {
          PartyRoom.pausePlayback();
        } else if (state.currentSong) {
          PartyRoom.resumePlayback();
        }
      });

      container.querySelector('#party-next-btn')?.addEventListener('click', () => {
        PartyRoom.skipToNext();
      });
    }

    // Bucket search & add
    const bucketSearchInput = container.querySelector('#bucket-search-input');
    const bucketSearchBtn = container.querySelector('#bucket-search-btn');

    bucketSearchBtn?.addEventListener('click', async () => {
      const query = bucketSearchInput.value.trim();
      if (!query) return;

      showToast('Searching...');
      const results = await API.search(query, 5);
      if (!results || results.length === 0) {
        showToast('No songs found');
        return;
      }

      // Show first result or let user pick
      const track = results[0];
      PartyRoom.addToBucket(track);
      bucketSearchInput.value = '';
      showToast('Added to bucket 🎵');
    });

    // Bucket item actions
    container.querySelectorAll('.play-bucket-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const songId = btn.dataset.songId;
        PartyRoom.playFromBucket(songId);
      });
    });

    container.querySelectorAll('.remove-bucket-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const songId = btn.dataset.songId;
        PartyRoom.removeFromBucket(songId);
      });
    });

    // Chat
    const chatInput = container.querySelector('#party-chat-input');
    const chatSendBtn = container.querySelector('#party-chat-send-btn');

    chatSendBtn?.addEventListener('click', () => {
      const text = chatInput.value.trim();
      if (text) {
        PartyRoom.sendMessage(text);
        chatInput.value = '';
      }
    });

    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        chatSendBtn.click();
      }
    });

    // Update UI on socket events
    document.addEventListener('party:play', _updatePlayerUI);
    document.addEventListener('party:pause', _updatePlayerUI);
    document.addEventListener('party:next', _updatePartyUI);
    document.addEventListener('party:bucketAdd', _updateBucketUI);
    document.addEventListener('party:bucketRemove', _updateBucketUI);
    document.addEventListener('party:messageNew', _updateChatUI);
  }

  function _updatePlayerUI() {
    // Re-render the player section
    const container = document.querySelector('.party-player');
    if (!container) return;

    const state = PartyRoom.getState();
    // Update player display
  }

  function _updateBucketUI() {
    const list = document.querySelector('#party-bucket-list');
    if (!list) return;
    // Rerender bucket
  }

  function _updateChatUI() {
    const messages = document.querySelector('#party-chat-messages');
    if (!messages) return;
    // Append new message
  }

  function _updatePartyUI() {
    // Full re-render of party interface
    const container = document.querySelector('.party-room-container');
    if (!container) {
      const main = document.getElementById('main-content');
      _showPartyInterface(main, PartyRoom.getState().roomId);
    }
  }

  return { render };
})();

function router_navigate_to_party(roomId) {
  Router.navigate('party', { roomId });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
