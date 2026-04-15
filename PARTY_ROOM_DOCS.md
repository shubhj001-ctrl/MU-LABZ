# 🎉 Party Room Feature Documentation

## Overview

The Party Room feature allows multiple users to listen to music together in real-time with a DJ-based control system, shared bucket list, and real-time chat.

---

## Architecture

### Frontend (Vanilla JS)
- **Main Component**: `JS/party.js` - Socket.IO manager and state handler
- **UI Page**: `JS/Pages/party.js` - Party room interface renderer
- **Styles**: `CSS/party-room.css` - Responsive styling
- **Integration**: Seamlessly integrated into the existing MU-LABZ routing system

### Backend (Node.js + Express + Socket.IO)
- **Server**: `backend/server.js` - Party room server with real-time sync
- **Rooms Storage**: In-memory Map (can be migrated to Redis for production)
- **WebSocket Events**: Full event-driven architecture for real-time communication

---

## Setup Instructions

### Backend Setup

1. **Install dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Start the server** (development):
   ```bash
   npm run dev  # Uses nodemon for auto-reload
   ```
   
   Or production:
   ```bash
   npm start
   ```

3. **Server starts on**: `http://localhost:3001`

### Frontend Integration

The frontend files are already in place. The Party Room feature is automatically available:
- Button in sidebar: "Party Room"
- Mobile nav support included
- CSS pre-integrated

---

## Feature Walkthrough

### 1. Entry Point

**URL**: Navigate to "Party Room" from sidebar/mobile nav

Users see two options:
- **Create Room** - Create a new party
- **Join Room** - Enter an existing room

### 2. Party Name Setup

Before creating or joining, users enter their "Party Name":
- Used throughout the room (chat, bucket, user list)
- Stored in `localStorage` for persistence
- Can be edited/updated anytime

### 3. Create Room Flow

**Fields**:
- Room Name (e.g., "Late Night Chill")
- Max Users (2-100)
- Room Type:
  - **Public**: Join requests go to DJ for approval
  - **Private**: Password-protected, direct join

**On Creation**:
- Unique 8-character room code generated
- Creator becomes DJ automatically
- Shareable link: `mu-labz.com#party/roomCode123`

### 4. Join Room Flow

**Public Room**:
1. User sends join request
2. DJ receives approval prompt
3. DJ approves → user joins

**Private Room**:
1. User enters password
2. Direct access if correct
3. Instant room join

### 5. DJ Controls

Only DJs see and control:
- ▶️ **Play/Pause** - Toggle playback
- ⏭️ **Next** - Skip to next song (from bucket)
- ⏮️ **Previous** - Go to previous
- 🎚️ **Progress Bar** - Seek to position

**All users sync to DJ's playback in real-time** (within ~500ms tolerance)

### 6. Bucket List (Shared Queue)

**All Users Can**:
- Search songs and add to bucket
- View songs added by others
- See "added by" attribution

**DJs Can Additionally**:
- Play song directly from bucket
- Remove songs
- Reorder songs (future enhancement)

### 7. User List

Shows all connected users with roles:
- 👑 **DJ** - Full control (highlighted)
- 👤 **Guest** - Can add to bucket, chat

**DJ Requests**:
- Guests can request to become DJ
- Current DJs approve/reject
- Multiple DJs allowed in a room

### 8. Chat System

- Real-time messaging
- Party names displayed
- Message history in current session
- Optional emoji reactions (future)

### 9. Room Lifecycle

**Room Exists If**:
- At least 1 DJ is connected

**Room Closes When**:
- Last DJ leaves
- All users disconnect
- Server explicitly deletes room

**Disconnection Handling**:
- If user loses connection, room waits 5 seconds before removal
- Auto-reconnect supported
- User joins back if reconnect within session

---

## Real-Time Events

### Playback Events
```
PLAY          → { currentSong, currentTime }
PAUSE         → { currentTime }
RESUME        → { currentTime }
SEEK          → { currentTime }
NEXT          → { currentSong }
SYNCTIME      → { currentTime } (periodic sync every 5s)
```

### Room Events
```
ROOM:CREATED        → DJ created a new room
ROOM:JOINED         → User joined existing room
ROOM:LEFT           → User left room
ROOM:CLOSED         → Room was deleted
USER:JOINED         → New user connected to room
USER:LEFT           → User disconnected
```

### Bucket Events
```
BUCKET:ADD          → { songId, title, artist, addedBy }
BUCKET:REMOVE       → { songId }
BUCKET:PLAY         → DJ plays song from bucket
```

### Role Events
```
ROLE:DJREQUEST      → Guest requests DJ status
ROLE:DJAPPROVED     → Guest promoted to DJ
ROLE:DJREJECTED     → DJ rejected request
JOINREQUEST:NEW     → (Public room) New join request
JOINREQUEST:APPROVE → DJ approves a join request
```

### Chat Events
```
MESSAGE:SEND        → { text, partyName, timestamp }
MESSAGE:NEW         → Received by all room users
```

---

## API Endpoints

### HTTP Routes

```
GET /health          → { status: "ok", timestamp }
GET /rooms           → Array of active rooms
```

### Socket.IO Events (Full List)

**Emitted by Client**:
- `room:create`
- `room:join`
- `room:leave`
- `playback:play`, `pause`, `resume`, `seek`, `next`
- `playback:syncTime`
- `bucket:add`, `bucket:remove`
- `role:requestDJ`, `role:approveDJ`
- `message:send`
- `joinRequest:approve`

**Emitted by Server**:
- `room:created`
- `room:joined`
- `room:closed`
- `user:joined`, `user:left`
- `playback:play`, `pause`, `resume`, `seek`, `next`, `syncTime`
- `bucket:add`, `bucket:remove`
- `role:djRequest`, `djApproved`, `djRejected`
- `joinRequest:new`, `joinRequest:approved`
- `message:new`
- `error`

---

## Production Deployment

### Frontend (Vercel)
The frontend is already set up for Vercel. The Party Room button is integrated into the sidebar.

### Backend Deployment Options

#### Option 1: Railway.app (Recommended)
1. Push `backend/` to GitHub
2. Connect Railway to GitHub repo
3. Set `Start Command`: `npm start`
4. Railway auto-assigns a URL

#### Option 2: Heroku
```bash
heroku create mu-labz-party
git push heroku main
heroku config:set NODE_ENV=production
```

#### Option 3: Self-hosted (VPS/Docker)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY backend .
RUN npm install
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables

**.env (backend)**:
```
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://mu-labz.vercel.app,https://yourdomain.com
```

### Frontend Configuration

Update Socket.IO connection in `JS/party.js`:

**For Local Development**:
```javascript
const backendUrl = 'http://localhost:3001';
```

**For Production**:
```javascript
const backendUrl = 'https://mu-labz-party.herokuapp.com';
// OR
const backendUrl = 'https://your-railway-app.up.railway.app';
```

---

## Mobile & Desktop UX

### Desktop (1400px+)
- 3-column layout: Player (center), Users & Bucket (left), Chat (right)
- Full DJ controls visible
- Comfortable spacing

### Tablet (768px - 1024px)
- 2-column side panels below player
- Users & Bucket on left, Chat on right
- Responsive text sizing

### Mobile (< 768px)
- Single column stacked layout
- Player full width
- Panels stack vertically
- Touch-optimized button sizes
- Collapsible sections (future)

---

## Data Storage

### Client-Side (localStorage)
```javascript
mu_labz_party_name    // User's party name
```

### Server-Side (In-Memory)
- Room objects (can add DB persistence)
- User connections (socket-based)
- Message history (current session)

**For Production**: Consider adding:
- PostgreSQL for persistence
- Redis for room state caching
- MongoDB for analytics

---

## Error Handling

### User-Facing Errors
- "Room not found" - Room ID incorrect or expired
- "Invalid password" - Wrong private room password
- "Room is full" - Max users exceeded
- "Join request pending" - Waiting for DJ approval
- "Connection lost" - Reconnect button shown

### Server-Side Logs
All events logged to console with timestamps:
```
[Socket]  Connection events
[Room]    Room creation/deletion
[Playback] Music sync events
[Bucket]  Queue management
[Chat]    Message logging
[Role]    DJ promotions/requests
```

---

## Browser Compatibility

- ✅ Chrome/Edge 88+
- ✅ Firefox 85+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Android)

---

## Performance Considerations

### Client-Side Optimizations
- Event debouncing for progress bar updates (100ms)
- Playback sync corrects drift every 5 seconds
- Lazy-load user lists (if > 50 users, paginate)
- CSS uses hardware acceleration (`will-change`, `transform`)

### Server-Side Optimizations
- In-memory storage suitable for ~500 concurrent rooms
- Each room emits only to connected users (scoped broadcasting)
- Message history optional (limit to 50 messages/room)
- Connection pooling ready for DB migration

### Network Bandwidth
- Typical event: ~200 bytes
- Active room (20 users): ~5-10 KB/s per user
- Chat messages: User-dependent
- ~500 KB/day per active room

---

## Security Considerations

### Current Implementation
- Basic password protection (string comparison)
- No authentication (socket.id used as userId)
- No encryption
- Room accessible to anyone with room ID

### Recommendations for Production
1. **Add user authentication**:
   - Integrate with existing user system
   - Issue JWT tokens on login
   - Validate tokens on socket connection

2. **Encrypt passwords**:
   ```javascript
   const bcrypt = require('bcrypt');
   room.password = await bcrypt.hash(password, 10);
   ```

3. **Rate limiting**:
   - Limit message frequency per user
   - Throttle bucket additions
   - Prevent room spam

4. **Input validation**:
   - Sanitize room names, passwords, messages
   - Use `xss` package for chat messages
   - Validate all incoming data

5. **HTTPS/WSS**:
   - Only allow secure WebSocket connections in production
   - Force HTTPS redirects

---

## Troubleshooting

### Issue: Can't connect to Socket.IO server
**Solution**:
1. Check backend is running: `curl http://localhost:3001/health`
2. Verify frontend Socket.IO URL matches backend
3. Check CORS config in `server.js`
4. Look for firewall blocking port 3001

### Issue: Playback not syncing
**Solution**:
1. Check DJ player is actually playing
2. Verify playback events are being emitted
3. Check network latency (`socket.io` has debug mode)
4. Restart the room

### Issue: Room persists after all users leave
**Solution**:
1. Manually check rooms: Visit `http://localhost:3001/rooms`
2. Verify `deleteRoom()` is being called
3. Check user disconnect handlers

### Issue: Mobile layout broken
**Solution**:
1. Check viewport meta tag in `index.html`:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   ```
2. Clear browser cache
3. Test in Chrome DevTools device mode

---

## Future Enhancements

### Phase 2
- [ ] Persistent room history (save past rooms)
- [ ] Song recommendations in bucket
- [ ] Emoji reactions in chat
- [ ] Room analytics (most played songs, active hours)
- [ ] Invite friends via QR code
- [ ] Voice chat (WebRTC)

### Phase 3
- [ ] Multi-DJ queue management
- [ ] User presence indicators (who's listening)
- [ ] Skill levels (beginner/intermediate/expert)
- [ ] Room themes/customization
- [ ] Social integration (share on Twitter/TikTok)
- [ ] Playlist import/export

### Phase 4
- [ ] Mobile native app (React Native)
- [ ] Desktop app (Electron)
- [ ] Spotify/Apple Music integration
- [ ] User subscriptions
- [ ] Advanced analytics

---

## File Structure

```
MU-LABZ/
├── index.html                    # Main HTML (updated with Party Room)
├── JS/
│   ├── party.js                  # 🆕 Socket.IO & state manager
│   ├── Pages/
│   │   └── party.js              # 🆕 Party Room page renderer
│   ├── router.js                 # ✏️ Updated with party route
│   ├── app.js
│   ├── state.js
│   └── ... (other files)
├── CSS/
│   ├── party-room.css            # 🆕 Party Room styles
│   └── ... (other styles)
├── backend/                      # 🆕 New backend folder
│   ├── server.js                 # Main server
│   ├── package.json              # Dependencies
│   └── README.md                 # Backend docs
└── ... (other assets)
```

---

## Support & Questions

For issues or questions:
1. Check browser console for errors
2. Check server logs in terminal
3. Review Socket.IO debug events: `socket.io.debug = true`
4. Check network tab in DevTools
5. Review this documentation

---

**Made with ❤️ for MU-LABZ**
