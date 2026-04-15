# ⚡ Quick Commands Reference

## Local Development

### Start Backend
```bash
cd backend
npm install
npm run dev
```

Server runs on: `http://localhost:3001`

### Check Backend Health
```bash
curl http://localhost:3001/health
```

Should return:
```json
{"status":"ok","timestamp":"2024-01-15T10:30:45.123Z"}
```

### List Active Rooms
```bash
curl http://localhost:3001/rooms
```

---

## Testing

### Create Room Flow
1. Visit MU-LABZ frontend (http://localhost:3000 or Vercel URL)
2. Click "Party Room" in sidebar
3. Click "Create Room"
4. Fill in form:
   - Party Name: Your name
   - Room Name: Any name
   - Max Users: 10 (default)
   - Type: Public or Private
5. Click "Create"
6. You're in as **DJ**

### Join Room Flow
1. Open new browser tab (or incognito)
2. Visit same MU-LABZ URL
3. Click "Party Room"
4. Click "Join Room"
5. Fill in:
   - Party Name: Different name
   - Room Code: Copy from first window
6. Click "Join"
7. You're in as **Guest**

### Test Features
- **Add to Bucket**: Search for song, click "+"
- **Play Song**: DJ clicks "▶️" on bucket song
- **Chat**: Type in chat input, press Enter
- **See Sync**: All users see same now playing

---

## Deployment

### Option 1: Railway (Recommended)

```bash
# 1. Create Railway account at railway.app
# 2. Push code to GitHub
# 3. Connect to Railway (auto-detects Node.js)
# 4. Railway gives you a URL like: https://mu-labz-party.up.railway.app

# 5. Update JS/party.js with the URL
# In backend/server.js around line 25:
const backendUrl = 'https://mu-labz-party.up.railway.app';

# 6. Redeploy frontend to Vercel
git push origin main  # Vercel auto-deploys
```

### Option 2: Heroku

```bash
heroku login
heroku create mu-labz-party
git push heroku main
```

Get URL from: `https://mu-labz-party.herokuapp.com`

### Option 3: Docker

```bash
docker build -t mu-labz-party .
docker run -p 3001:3001 mu-labz-party
```

---

## Environment Variables

### backend/.env
```
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://mu-labz.vercel.app,https://yourdomain.com
```

---

## Debugging

### Browser Console - Enable Debug Logs
```javascript
localStorage.debug = 'socket.io-client:*';
// Refresh page
// Open DevTools → Console
// See all Socket.IO events
```

### Server Logs
Watch these tags in terminal:
```
[Socket]     - Connection events
[Room]       - Room lifecycle
[Playback]   - Music sync
[Bucket]     - Queue changes
[Chat]       - Messages
[Role]       - DJ promotions
```

### Check Connections
```bash
# In browser DevTools
# Network tab → filter by "socket.io"
# Should see active WebSocket connection
```

---

## Database Connection (Future)

### Add PostgreSQL Storage
```bash
npm install pg dotenv
```

Then update `backend/server.js`:
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Replace Map storage with database queries
```

---

## Performance Monitoring

### Check Room Stats
```bash
curl http://localhost:3001/rooms
```

Response shows:
- Room IDs
- User counts
- Max capacity
- Creation time

### Monitor Memory
```bash
# On Linux/Mac
while true; do 
  ps aux | grep 'node server.js'
  sleep 2
done

# Shows RSS (memory) and CPU usage
```

---

## Troubleshooting Commands

### Backend Won't Start
```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill process on port 3001
kill -9 <PID>

# Try different port
PORT=3002 npm start
```

### Socket.IO Connection Failed
```bash
# 1. Verify backend running
curl http://localhost:3001/health

# 2. Check CORS in browser DevTools
# Network tab → look for 404 or 403 errors

# 3. Update CORS in backend/server.js if needed
const io = socketIO(server, {
  cors: {
    origin: 'http://localhost:3000',  // ← Add your URL
    methods: ['GET', 'POST'],
  },
});
```

### Room Not Persisting
This is expected! Rooms are in-memory (cleared on restart).
For persistence, add database (see Phase 2 in docs).

### Chat Not Sending
```javascript
// In browser console, check:
// 1. Connected?
if (PartyRoom.isConnected()) console.log('✅ Connected');

// 2. In room?
console.log(PartyRoom.getState());

// 3. Enable debug:
localStorage.debug = 'socket.io-client:*';
```

---

## Code Structure Quick Reference

### Frontend Entry Points
```javascript
// Sidebar navigation
// Click "Party Room" → Router.navigate('party')
// → JS/Pages/party.js renders

// Socket.IO manager
PartyRoom.init()              // Initialize connection
PartyRoom.createRoom(...)     // Create room
PartyRoom.joinRoom(...)       // Join room
PartyRoom.leaveRoom()         // Leave room
```

### Backend Entry Points
```javascript
io.on('connection', (socket) => {
  socket.on('room:create', handler)
  socket.on('room:join', handler)
  socket.on('playback:play', handler)
  socket.on('bucket:add', handler)
  socket.on('message:send', handler)
})
```

### Real-time Events
```javascript
// Client emits:
socket.emit('playback:play', { trackData })

// Server broadcasts:
io.to(roomId).emit('playback:play', { trackData })

// Clients receive:
document.addEventListener('party:play', handler)
```

---

## File Locations

```
MU-LABZ/
├── JS/party.js                    (Socket.IO manager)
├── JS/Pages/party.js              (UI renderer)
├── CSS/party-room.css             (Styles)
├── JS/router.js                   (Routes)
├── index.html                     (HTML)
├── backend/
│   ├── server.js                  (Backend server)
│   ├── package.json               (Dependencies)
│   └── README.md                  (Backend docs)
├── QUICKSTART.md                  (Setup guide)
├── PARTY_ROOM_DOCS.md             (Full docs)
├── IMPLEMENTATION_CHECKLIST.md    (Checklist)
└── PARTY_ROOM_SUMMARY.md          (Summary)
```

---

## Common Edits

### Change Backend URL
**File**: `JS/party.js` (line ~25)
```javascript
// Development:
const backendUrl = 'http://localhost:3001';

// Production:
const backendUrl = 'https://your-backend-url.herokuapp.com';
```

### Change CORS Origins
**File**: `backend/server.js` (line ~18)
```javascript
const io = socketIO(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://mu-labz.vercel.app'
    ],
    methods: ['GET', 'POST'],
  },
});
```

### Change Port
**File**: `backend/server.js` (line at bottom)
```javascript
const PORT = process.env.PORT || 3001;  // ← Change 3001
```

Or run with:
```bash
PORT=5000 npm start
```

---

## Git Commands

### Push to GitHub
```bash
git add .
git commit -m "Add Party Room feature"
git push origin main
```

### Update Backend on Railway
```bash
git push origin main
# Railway auto-deploys from GitHub
```

### Update Frontend on Vercel
```bash
git push origin main
# Vercel auto-deploys from GitHub
```

---

## npm Scripts

### Backend
```bash
npm install          # Install dependencies
npm run dev          # Start with auto-reload
npm start            # Start production
npm test             # Run tests (if configured)
```

### Frontend (in root)
```bash
# If you add frontend build process later:
npm install          # Install dependencies
npm run build        # Build for production
npm run dev          # Dev server (if added)
```

---

## Verification Commands

### ✅ Everything Working?
```bash
# 1. Backend running?
curl http://localhost:3001/health

# 2. Rooms exist?
curl http://localhost:3001/rooms

# 3. Socket connected?
# Open browser DevTools → Console → check localStorage.debug

# 4. Frontend working?
# Visit http://localhost:3000
# Click "Party Room"
# Should see interface
```

---

## Production Checklist Commands

```bash
# 1. Backend health
curl https://your-backend-url.herokuapp.com/health

# 2. Create test room
# Visit production URL → Create room

# 3. Join test room
# New tab → Join with code

# 4. Monitor logs
heroku logs --tail -a mu-labz-party

# 5. Check performance
heroku ps -a mu-labz-party
```

---

## Advanced

### Enable Request Logging
```javascript
// In backend/server.js, add:
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});
```

### Add Message Persistence
```javascript
// In backend/server.js, replace:
messages: []

// With database query:
messages: await db.query('SELECT * FROM messages WHERE room_id = $1')
```

### Add Rate Limiting
```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));
```

---

**All commands copy-paste ready!** ⚡
