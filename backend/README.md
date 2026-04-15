# MU-LABZ Party Room Backend

Real-time collaborative music streaming server using Node.js, Express, and Socket.IO.

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Runs with auto-reload (nodemon). Watch console output for logs.

### Production

```bash
npm start
```

## Environment

- **Node.js**: 14+ (tested on 18)
- **Port**: 3001 (default) or `PORT` env variable
- **Dependencies**:
  - `express` - HTTP server
  - `socket.io` - WebSocket library
  - `cors` - Cross-origin requests
  - `uuid` - Room ID generation

## Endpoints

### HTTP
- `GET /health` - Server status
- `GET /rooms` - List active rooms

### WebSocket (Socket.IO)

See `PARTY_ROOM_DOCS.md` for full event documentation.

## Architecture

### Data Structure

```javascript
// Room object
{
  id: "6a3f9c2b",              // 8-char unique identifier
  name: "Late Night Chill",     // User-friendly name
  type: "public|private",      // Public (join requests) or Private (password)
  password: "secure123",       // Only if private
  maxUsers: 20,                // Max concurrent users
  createdAt: 1699999999,       // Timestamp
  creatorId: "sock_id_123",    // Socket ID of creator
  
  // Users
  djs: [
    { userId: "sock_id_123", partyName: "Alex" }
  ],
  users: [
    { userId: "sock_id_456", partyName: "Jordan", role: "guest" }
  ],
  pendingRequests: [           // For public rooms
    { userId: "sock_id_789", partyName: "Sam", requestedAt: 1699999999 }
  ],
  
  // Playback state
  currentSong: {
    id: "song_123",
    title: "Night Drive",
    artist: "Artist Name"
  },
  currentTime: 42.5,           // Seconds
  isPlaying: true,
  
  // Shared queue
  bucket: [
    { songId: "song_456", title: "...", artist: "...", addedBy: "...", addedAt: 1699999999 }
  ],
  
  // Chat history
  messages: [
    { userId: "sock_id_456", partyName: "Jordan", text: "...", timestamp: 1699999999 }
  ]
}
```

### Socket Events Flow

**Client → Server** (Emit):
- Room management: `room:create`, `room:join`, `room:leave`
- Playback: `playback:play`, `playback:pause`, etc.
- Queue: `bucket:add`, `bucket:remove`
- Chat: `message:send`
- Roles: `role:approveDJ`, `role:requestDJ`

**Server → Client** (Emit):
- Room updates: `room:created`, `user:joined`, etc.
- Playback sync: `playback:play`, `playback:seek`, etc.
- Queue updates: `bucket:add`, `bucket:remove`
- New messages: `message:new`
- Role changes: `role:djApproved`, etc.

## Deployment

### Railway.app (Recommended)

1. Push to GitHub
2. Connect Railway to GitHub
3. Railway detects `package.json` automatically
4. Set `Start Command`: `npm start`
5. Done! Get your URL from Railway dashboard

### Heroku

```bash
heroku create mu-labz-party
git push heroku main
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install --production
EXPOSE 3001
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t mu-labz-party .
docker run -p 3001:3001 mu-labz-party
```

## Configuration

### CORS

Update `server.js` to allow your frontend domain:

```javascript
const io = socketIO(server, {
  cors: {
    origin: ['http://localhost:3000', 'https://mu-labz.vercel.app'],
    methods: ['GET', 'POST'],
  },
});
```

### Port

Default: 3001

Override:
```bash
PORT=5000 npm start
```

## Monitoring

### Check Server Health

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### List Active Rooms

```bash
curl http://localhost:3001/rooms
```

Response:
```json
[
  {
    "id": "6a3f9c2b",
    "name": "Late Night Chill",
    "users": 5,
    "maxUsers": 20,
    "createdAt": 1705318245123
  }
]
```

### Socket.IO Debug

Enable detailed logging in the browser console:

```javascript
localStorage.debug = 'socket.io-client:*';
// Then refresh the page
```

Server-side debug (nodemon):
```bash
DEBUG=* npm run dev
```

## Performance

- **Max concurrent rooms**: ~500 (limited by machine RAM)
- **Max users per room**: 1-100 (configurable)
- **Bandwidth per active room**: ~5-10 KB/s
- **CPU usage**: Minimal (event-driven, no heavy processing)
- **RAM per active room**: ~5-10 KB

### Scaling

For high load, consider:
- **Redis adapter** - Distribute rooms across multiple servers
- **Database** - Persist rooms and messages
- **CDN** - Serve static files from edge
- **Load balancer** - Distribute connections

## Troubleshooting

### Port already in use

```bash
lsof -i :3001  # List processes on port 3001
kill -9 <PID>  # Kill the process
```

Or use a different port:
```bash
PORT=3002 npm start
```

### CORS errors in browser

Check console for:
```
Access to XMLHttpRequest blocked by CORS policy
```

Solution: Update `cors` config in `server.js` to include your domain.

### Rooms not loading

1. Check `/rooms` endpoint
2. Check browser console websocket connection
3. Look at server logs for errors
4. Try manual room creation via Socket.IO debugger

### Memory leak (rooms not closing)

Check `deleteRoom()` is being called. Rooms are deleted when:
- Last DJ leaves
- All users disconnect
- Server restart

Monitor with:
```bash
node --inspect server.js
# Then open chrome://inspect
```

## Production Checklist

- [ ] Environment variable validation
- [ ] CORS configured for your domain
- [ ] Error logging (Sentry, etc.)
- [ ] Database persistence
- [ ] Rate limiting
- [ ] Input validation/sanitization
- [ ] HTTPS/WSS enforcement
- [ ] Monitoring & alerts
- [ ] Backup strategy
- [ ] Security headers

## Development Tips

### Testing Rooms Locally

Use separate browser windows/tabs to simulate multiple users:

1. Window A: Create room
2. Window B: Join with room code
3. Test DJ controls, chat, bucket

### Socket.IO Inspector

Chrome extension for debugging:
- "Socket.IO DevTools"
- Real-time event visualization
- Event replay/testing

### Logs

Server logs tagged by context:
- `[Socket]` - Connection events
- `[Room]` - Room lifecycle
- `[Playback]` - Music sync
- `[Bucket]` - Queue changes
- `[Chat]` - Messages
- `[Role]` - DJ promotions

## License

MIT

---

For full feature documentation, see `PARTY_ROOM_DOCS.md` in the root directory.
