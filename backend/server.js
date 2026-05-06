/**
 * backend/server.js — Party Room Backend (FIXED & IMPROVED)
 *
 * Node.js + Express + Socket.IO server
 * Handles room management, real-time sync, user connections, and user removal
 *
 * Run: npm install express socket.io uuid cors
 * Then: node server.js
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// CORS Configuration - Allow requests from both local and production
const corsOrigins = [
  'http://localhost:3000',
  'http://localhost:8000',
  'http://localhost:5173', // Vite dev server
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:5173',
  'https://mulabz.vercel.app',
  'https://mulabz.onrender.com',
];

const corsOptions = {
  origin: function(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
};

app.use(cors(corsOptions));

const io = socketIO(server, {
  cors: corsOptions,
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  }
});

app.use(express.json());

const JIOSAAVN_PROXY_HOSTS = [
  'https://saavnapi.tech',
  'https://jiosaavn-api-privatecvc2.vercel.app', // fallback
];

function _jiosaavnProxyFallback(targetPath) {
  const path = targetPath.toLowerCase();
  if (path.startsWith('search/songs')) return { data: { results: [] } };
  if (path.startsWith('search/albums')) return { data: { results: [] } };
  if (path.startsWith('albums')) return { data: { songs: [] } };
  if (path.includes('/songs')) return { data: { songs: [] } };
  if (path.includes('/albums')) return { data: { albums: [] } };
  return { data: {} };
}

// Proxy endpoint for JioSaavn API to avoid browser CORS blocks
app.all('/proxy/jiosaavn/*', async (req, res) => {
  const targetPath = req.params[0] || '';
  
  for (let i = 0; i < JIOSAAVN_PROXY_HOSTS.length; i++) {
    try {
      const host = JIOSAAVN_PROXY_HOSTS[i];
      const targetUrl = new URL(`${host}/${targetPath}`);
      targetUrl.search = new URLSearchParams(req.query).toString();

      const forwardedHeaders = {};
      for (const [key, value] of Object.entries(req.headers)) {
        const lower = key.toLowerCase();
        if (['host', 'origin', 'referer', 'content-length'].includes(lower)) continue;
        if (value) forwardedHeaders[key] = value;
      }
      forwardedHeaders.Accept = forwardedHeaders.Accept || 'application/json';
      forwardedHeaders['User-Agent'] = forwardedHeaders['User-Agent'] || 'MU-LABZ/1.0';

      const fetchOptions = {
        method: req.method,
        headers: forwardedHeaders,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      };

      const backendRes = await fetch(targetUrl.href, fetchOptions);
      
      // If 402 or 503, try next host
      if (backendRes.status === 402 || backendRes.status === 503) {
        console.warn(`[Proxy] ${host} returned ${backendRes.status}, trying next host...`);
        continue;
      }

      res.status(backendRes.status);
      backendRes.headers.forEach((value, name) => {
        if (name.toLowerCase() === 'content-encoding') return;
        res.setHeader(name, value);
      });

      const responseBuffer = Buffer.from(await backendRes.arrayBuffer());
      res.set('X-Proxy-Host', host);
      res.send(responseBuffer);
      return;
    } catch (error) {
      console.warn(`[Proxy] Error with ${JIOSAAVN_PROXY_HOSTS[i]}:`, error.message);
      if (i === JIOSAAVN_PROXY_HOSTS.length - 1) {
        // Last host, return fallback
        const fallback = _jiosaavnProxyFallback(targetPath);
        res.status(200).set('Content-Type', 'application/json').set('X-Proxy-Status', 'all-hosts-failed').send(JSON.stringify(fallback));
        return;
      }
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rooms list endpoint
app.get('/rooms', (req, res) => {
  const roomsList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    type: room.type,
    users: room.users.length + room.djs.length,
    maxUsers: room.maxUsers,
  }));
  res.json(roomsList);
});

// ── Room Storage ───────────────────────────────────────────────────

const rooms = new Map(); // roomId -> room object
const userSockets = new Map(); // userId -> socket id
const socketToUser = new Map(); // socket id -> { userId, roomId }
const recentlyKicked = new Map(); // socketId -> { roomId, kickTime } - track recently kicked users to prevent immediate rejoin

// ── Room Structure ─────────────────────────────────────────────────

function createRoom(roomName, maxUsers, roomType, password, creatorId, creatorPartyName) {
  const roomId = uuidv4().substring(0, 8);
  // Generate 4-digit passcode for private rooms
  const roomPassword = roomType === 'private' ? (password || generatePasscode()) : null;
  
  const room = {
    id: roomId,
    name: roomName,
    type: roomType,
    password: roomPassword,
    maxUsers,
    createdAt: Date.now(),
    creatorId,
    
    // Users
    djs: [{ userId: creatorId, partyName: creatorPartyName, socketId: null }],
    users: [],
    
    // Join requests (users waiting for DJ approval)
    pendingJoins: [], // [{ userId, partyName, socketId, requestTime }, ...]
    
    // Playback state
    currentSong: null,
    currentTime: 0,
    isPlaying: false,
    
    // Bucket list
    bucket: [],
  };
  
  rooms.set(roomId, room);
  console.log(`[Room] Created room: ${roomId} - ${roomName} (${roomType}) - Pass: ${roomPassword}`);
  return room;
}

function generatePasscode() {
  return String(Math.floor(Math.random() * 9000) + 1000); // 4-digit number
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function deleteRoom(roomId) {
  const room = getRoom(roomId);
  if (room) {
    rooms.delete(roomId);
    console.log(`[Room] Deleted room: ${roomId}`);
    
    // Notify all users in room
    io.to(roomId).emit('room:closed', { reason: 'Room ended' });
  }
}

// ── Socket Events ───────────────────────────────────────────────────

io.on('connection', (socket) => {
  const origin = socket.handshake.headers.origin || 'unknown';
  console.log(`✅ [Socket] User connected: ${socket.id}`);
  console.log(`📍 [Socket] From origin: ${origin}`);
  console.log(`🔗 [Socket] Transport: ${socket.conn.transport.name}`);

  socket.emit('connect:success', { 
    message: 'Connected to Party Room backend',
    timestamp: new Date().toISOString()
  });

  socket.on('connect_error', (error) => {
    console.error(`⚠️  [Socket] Connection error for ${socket.id}:`, error?.message);
  });

  socket.on('error', (error) => {
    console.error(`⚠️  [Socket] Error for ${socket.id}:`, error?.message);
  });

  socket.on('room:create', (data) => {
    const userId = socket.id;
    const { roomName, maxUsers, roomType, password, partyName } = data;

    const room = createRoom(roomName, maxUsers, roomType, password, userId, partyName);
    
    socket.join(room.id);
    socketToUser.set(socket.id, { userId, roomId: room.id });
    userSockets.set(userId, socket.id);

    // Update DJ with socket ID
    const dj = room.djs.find(d => d.userId === userId);
    if (dj) dj.socketId = socket.id;

    socket.emit('room:created', {
      roomId: room.id,
      roomName: room.name,
      roomType: room.type,
      roomPassword: room.password,
      creatorId: userId,
      userId,
    });

    console.log(`[Socket] ${partyName} created room ${room.id} (${roomType})`);
  });

  // ✅ FIX: Handle direct room join (for DJ rejoining or direct share link)
  socket.on('room:join', (data) => {
    const userId = socket.id;
    const { roomId, password, partyName } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { type: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }

    // Check password if required
    if (room.password && room.password !== password) {
      socket.emit('error', { type: 'INVALID_PASSWORD', message: 'Invalid room password' });
      return;
    }

    // Check if user is already in room (DJ)
    const isDJ = room.djs.find(d => d.userId === userId);
    if (isDJ) {
      // DJ rejoining - send them full room state including pending requests
      socket.join(room.id);
      socketToUser.set(socket.id, { userId, roomId });
      userSockets.set(userId, socket.id);

      // Update DJ's socket ID
      const dj = room.djs.find(d => d.userId === userId);
      if (dj) dj.socketId = socket.id;

      socket.emit('room:joined', {
        roomId: room.id,
        roomName: room.name,
        roomType: room.type,
        creatorId: room.creatorId,
        userId,
        role: 'dj',
        djs: room.djs,
        users: room.users,
        bucket: room.bucket,
        currentSong: room.currentSong,
        isPlaying: room.isPlaying,
        currentTime: room.currentTime,
        // ✅ FIX: Send pending requests to DJ
        pendingRequests: room.pendingJoins.map(req => ({
          userId: req.userId,
          partyName: req.partyName,
          requestTime: req.requestTime,
        })),
      });

      console.log(`[Socket] DJ ${partyName} rejoined room ${roomId}`);
    } else {
      // Guest trying to join directly (not via request) - should use joinRequest flow
      // But if direct join attempted, treat as join request
      if (room.users.find(u => u.userId === userId)) {
        // Already a guest in room
        socket.join(room.id);
        socketToUser.set(socket.id, { userId, roomId });
        userSockets.set(userId, socket.id);

        socket.emit('room:joined', {
          roomId: room.id,
          roomName: room.name,
          roomType: room.type,
          creatorId: room.creatorId,
          userId,
          role: 'guest',
          djs: room.djs,
          users: room.users,
          bucket: room.bucket,
          currentSong: room.currentSong,
          isPlaying: room.isPlaying,
          currentTime: room.currentTime,
        });
      } else {
        // New user - send to join request flow
        socket.emit('error', { type: 'NOT_IN_ROOM', message: 'Please request to join' });
      }
    }
  });

  socket.on('room:joinRequest', (data) => {
    const userId = socket.id;
    const { roomId, password, partyName } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { type: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
      console.log(`[Error] User tried to join non-existent room: ${roomId}`);
      return;
    }

    // Check password for private rooms
    if (room.type === 'private') {
      if (!password || room.password !== password) {
        socket.emit('error', { type: 'INVALID_PASSWORD', message: 'Invalid room passcode' });
        console.log(`[Error] Invalid password for room ${roomId}`);
        return;
      }
    }

    // Check if already in request list
    if (room.pendingJoins.find(req => req.userId === userId)) {
      socket.emit('error', { type: 'ALREADY_REQUESTED', message: 'You already have a pending request' });
      return;
    }

    // Add to pending joins list
    const joinRequest = { userId, partyName, socketId: socket.id, requestTime: Date.now() };
    room.pendingJoins.push(joinRequest);
    
    socketToUser.set(socket.id, { userId, roomId });
    userSockets.set(userId, socket.id);

    // Notify user their request is pending
    socket.emit('joinRequest:pending', {
      roomId: room.id,
      roomName: room.name,
      message: 'Your request to join has been sent. Waiting for DJ approval...',
    });

   // Notify DJ(s) of new join request
    room.djs.forEach(dj => {
      const djSocket = dj.socketId ? io.sockets.sockets.get(dj.socketId) : null;
      if (djSocket) {
        djSocket.emit('joinRequest:new', {
          requestId: userId,
          partyName,
          pendingRequests: room.pendingJoins.map(req => ({
            userId: req.userId,
            partyName: req.partyName,
            requestTime: req.requestTime,
          })),
        });
      }
    });

    console.log(`[Socket] ${partyName} requested to join room ${roomId}`);
  });

  // DJ: Approve join request
  socket.on('joinRequest:approve', (data) => {
    const { roomId, requestUserId } = data;
    const room = getRoom(roomId);
    const djUser = socketToUser.get(socket.id);

    if (!room) return;
    if (!djUser) return;

    // Check if DJ
    const isDJ = room.djs.find(d => d.userId === djUser.userId);
    if (!isDJ) {
      socket.emit('error', { type: 'NOT_AUTHORIZED', message: 'Only DJ can approve requests' });
      return;
    }

    // Find pending request
    const request = room.pendingJoins.find(req => req.userId === requestUserId);
    if (!request) {
      socket.emit('error', { type: 'REQUEST_NOT_FOUND', message: 'Join request not found' });
      return;
    }

    // Check room capacity
    if (room.users.length + room.djs.length >= room.maxUsers) {
      socket.emit('error', { type: 'ROOM_FULL', message: 'Room is full' });
      
      // Notify user they were rejected (room full)
      const userSocket = io.sockets.sockets.get(request.socketId);
      if (userSocket) {
        userSocket.emit('joinRequest:rejected', { 
          roomId,
          reason: 'Room is full' 
        });
        userSocket.disconnect(true);
        userSockets.delete(requestUserId);
        socketToUser.delete(request.socketId);
      }
      return;
    }

    // Move from pending to users
    room.pendingJoins = room.pendingJoins.filter(req => req.userId !== requestUserId);
    const user = { userId: requestUserId, partyName: request.partyName, socketId: request.socketId, role: 'guest' };
    room.users.push(user);
    
    // Join user to socket.io room
    io.sockets.sockets.get(request.socketId)?.join(room.id);

    // Send room state to approved user
    const userSocket = io.sockets.sockets.get(request.socketId);
    if (userSocket) {
      userSocket.emit('joinRequest:approved', {
        roomId: room.id,
        roomName: room.name,
        roomType: room.type,
        creatorId: room.creatorId,
        userId: requestUserId,
        role: 'guest',
        djs: room.djs,
        users: room.users,
        bucket: room.bucket,
        currentSong: room.currentSong,
        isPlaying: room.isPlaying,
        currentTime: room.currentTime,
      });
    }

    // Notify room of new user
    io.to(room.id).emit('user:joined', {
      userId: requestUserId,
      partyName: request.partyName,
      role: 'guest',
    });

    // Update DJ's pending requests list
    io.to(room.id).emit('joinRequest:list', {
      pendingRequests: room.pendingJoins.map(req => ({
        userId: req.userId,
        partyName: req.partyName,
        requestTime: req.requestTime,
      })),
    });

    console.log(`[Socket] DJ approved ${request.partyName} to join room ${roomId}`);
  });

  // DJ: Reject join request
  socket.on('joinRequest:reject', (data) => {
    const { roomId, requestUserId } = data;
    const room = getRoom(roomId);
    const djUser = socketToUser.get(socket.id);

    if (!room) return;
    if (!djUser) return;

    // Check if DJ
    const isDJ = room.djs.find(d => d.userId === djUser.userId);
    if (!isDJ) {
      socket.emit('error', { type: 'NOT_AUTHORIZED', message: 'Only DJ can reject requests' });
      return;
    }

    // Find pending request
    const request = room.pendingJoins.find(req => req.userId === requestUserId);
    if (!request) {
      socket.emit('error', { type: 'REQUEST_NOT_FOUND', message: 'Join request not found' });
      return;
    }

    // Remove from pending
    room.pendingJoins = room.pendingJoins.filter(req => req.userId !== requestUserId);

    // Notify user they were rejected
    const userSocket = io.sockets.sockets.get(request.socketId);
    if (userSocket) {
      userSocket.emit('joinRequest:rejected', { 
        roomId,
        reason: 'DJ rejected your request' 
      });
      userSocket.disconnect(true);
      userSockets.delete(requestUserId);
      socketToUser.delete(request.socketId);
    }

    // Update DJ's pending requests list
    io.to(room.id).emit('joinRequest:list', {
      pendingRequests: room.pendingJoins.map(req => ({
        userId: req.userId,
        partyName: req.partyName,
        requestTime: req.requestTime,
      })),
    });

    console.log(`[Socket] DJ rejected ${request.partyName}'s request to join room ${roomId}`);
  });

  // USER REMOVAL (DJ only)
  socket.on('user:remove', (data) => {
    const { roomId, userIdToRemove } = data;
    const room = getRoom(roomId);
    const removerUser = socketToUser.get(socket.id);

    if (!room) return;
    if (!removerUser) return;

    // Check if current user is DJ
    const removerIsDJ = room.djs.find(d => d.userId === removerUser.userId);
    if (!removerIsDJ) {
      socket.emit('error', { type: 'NOT_AUTHORIZED', message: 'Only DJ can remove users' });
      return;
    }

    // Find and remove user from room
    const userToRemove = room.users.find(u => u.userId === userIdToRemove);
    if (userToRemove) {
      room.users = room.users.filter(u => u.userId !== userIdToRemove);
      
      // Notify removed user and disconnect them
      const userSocket = userSockets.get(userIdToRemove);
      if (userSocket) {
        // Track this socket as recently kicked to prevent immediate rejoin
        recentlyKicked.set(userSocket, { roomId, kickTime: Date.now() });
        
        // Notify user they were removed
        io.to(userSocket).emit('user:removed', { 
          userId: userIdToRemove,
          reason: 'DJ removed you from room' 
        });
        
        // Leave room
        io.sockets.sockets.get(userSocket)?.leave(roomId);
        
        // Disconnect socket so they can't hear music anymore
        io.sockets.sockets.get(userSocket)?.disconnect(true);
        
        // Clean up tracking
        userSockets.delete(userIdToRemove);
        socketToUser.delete(userSocket);
      }

      // Notify room that user was removed
      io.to(roomId).emit('user:removed', {
        userId: userIdToRemove,
        partyName: userToRemove.partyName,
      });

      console.log(`[User] ${userToRemove.partyName} removed from ${roomId} by DJ and disconnected`);
    }
  });

  // USER PROMOTION (DJ only - make a guest into a DJ)
  socket.on('user:promote', (data) => {
    const { roomId, userIdToPromote } = data;
    const room = getRoom(roomId);
    const promoterUser = socketToUser.get(socket.id);

    if (!room) return;
    if (!promoterUser) return;

    // Check if current user is DJ
    const promoterIsDJ = room.djs.find(d => d.userId === promoterUser.userId);
    if (!promoterIsDJ) {
      socket.emit('error', { type: 'NOT_AUTHORIZED', message: 'Only DJ can promote users' });
      return;
    }

    // Find and promote user from guests to DJs
    const userToPromote = room.users.find(u => u.userId === userIdToPromote);
    if (userToPromote) {
      // Remove from users list and add to DJs list
      room.users = room.users.filter(u => u.userId !== userIdToPromote);
      room.djs.push({
        userId: userIdToPromote,
        partyName: userToPromote.partyName,
      });

      // Notify room that user was promoted
      io.to(roomId).emit('user:promoted', {
        userId: userIdToPromote,
        partyName: userToPromote.partyName,
      });

      console.log(`[User] ${userToPromote.partyName} promoted to DJ in ${roomId}`);
    }
  });
  socket.on('playback:play', (data) => {
    const { roomId, currentSong, currentTime } = data;
    const room = getRoom(roomId);
    const user = socketToUser.get(socket.id);
    
    if (!room || !user) return;

    // Check if user is DJ
    const isDJ = room.djs.find(dj => dj.userId === user.userId);
    if (!isDJ) {
      socket.emit('error', { type: 'NOT_AUTHORIZED', message: 'Only DJ can control playback' });
      return;
    }

    // Record server timestamp for sync
    const playStartTime = Date.now();
    
    room.currentSong = currentSong;
    room.currentTime = currentTime || 0;
    room.isPlaying = true;
    room.playStartTime = playStartTime; // Store for sync

    io.to(roomId).emit('playback:play', {
      currentSong,
      currentTime,
      playStartTime, // Send to all clients for sync
      serverTime: Date.now(),
    });

    console.log(`[Playback] Playing: ${currentSong?.title} in ${roomId} at ${playStartTime}`);
  });

  // DJ Controls - Pause
  socket.on('playback:pause', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.isPlaying = false;
    room.currentTime = currentTime;

    io.to(roomId).emit('playback:pause', {
      currentTime,
    });
  });

  // DJ Controls - Resume
  socket.on('playback:resume', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.isPlaying = true;
    room.currentTime = currentTime;

    io.to(roomId).emit('playback:resume', {
      currentTime,
    });
  });

  // DJ Controls - Seek
  socket.on('playback:seek', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.currentTime = currentTime;

    io.to(roomId).emit('playback:seek', {
      currentTime,
    });
  });

  // DJ Controls - Skip to Next
  socket.on('playback:next', (data) => {
    const { roomId } = data;
    const room = getRoom(roomId);
    const user = socketToUser.get(socket.id);
    
    if (!room || !user) return;

    // Check if user is DJ
    const isDJ = room.djs.find(dj => dj.userId === user.userId);
    if (!isDJ) {
      socket.emit('error', { type: 'NOT_AUTHORIZED', message: 'Only DJ can skip tracks' });
      return;
    }

    // Get next from bucket
    if (room.bucket.length > 0) {
      const nextItem = room.bucket.shift();
      room.currentSong = {
        id: nextItem.songId,
        title: nextItem.title,
        artist: nextItem.artist,
        image: nextItem.image,
        audio: nextItem.audio,
        duration: nextItem.duration,
        source: nextItem.source,
        genre: nextItem.genre,
      };
      room.isPlaying = true;
    } else {
      // Bucket is empty - trigger auto-play on clients
      room.currentSong = null;
      room.isPlaying = false;
    }

    room.currentTime = 0;

    io.to(roomId).emit('playback:next', {
      currentSong: room.currentSong,
      bucketEmpty: room.bucket.length === 0,
    });

    console.log(`[Playback] Skipped to next in ${roomId}. Bucket empty: ${room.bucket.length === 0}`);
  });

  // Sync playback time
  socket.on('playback:syncTime', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.currentTime = currentTime;
    socket.to(roomId).emit('playback:syncTime', {
      currentTime,
    });
  });

  // Bucket - Add Song
  socket.on('bucket:add', (data) => {
    const { roomId, songId, title, artist, image, addedBy, source, audio, duration, genre } = data;
    const room = getRoom(roomId);
    
    if (!room) {
      console.error(`[Bucket] ROOM NOT FOUND: ${roomId} when trying to add song "${title}"`);
      socket.emit('error', { 
        type: 'ROOM_NOT_FOUND', 
        message: 'Room does not exist',
        action: 'bucket:add',
        roomId,
      });
      return;
    }

    const item = {
      songId,
      id: songId,
      title,
      artist,
      image,
      addedBy,
      addedAt: Date.now(),
      source: source || 'jiosaavn',
      audio,
      duration: duration || 0,
      genre,
    };

    room.bucket.push(item);

    io.to(roomId).emit('bucket:add', item);
    console.log(`[Bucket] ✓ Added to ${roomId}: ${title} (source: ${source}, hasAudio: ${!!audio})`);
  });

  // Bucket - Remove Song
  socket.on('bucket:remove', (data) => {
    const { roomId, songId } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.bucket = room.bucket.filter(b => b.songId !== songId);

    io.to(roomId).emit('bucket:remove', {
      songId,
    });
  });

  // Room - Leave
  socket.on('room:leave', (data) => {
    const { roomId } = data;
    const userInfo = socketToUser.get(socket.id);
    const room = getRoom(roomId);

    if (!room || !userInfo) return;

    // Check if DJ left
    const isDJ = room.djs.find(d => d.userId === userInfo.userId);

    if (isDJ) {
      // DJ left - close room
      deleteRoom(roomId);
    } else {
      // Guest left - remove from both users AND djs
      room.users = room.users.filter(u => u.userId !== userInfo.userId);
      room.djs = room.djs.filter(d => d.userId !== userInfo.userId);
      io.to(roomId).emit('user:left', {
        userId: userInfo.userId,
      });
    }

    socket.leave(roomId);
    socketToUser.delete(socket.id);
    userSockets.delete(userInfo.userId);

    console.log(`[Room] User left ${roomId}`);
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    const userInfo = socketToUser.get(socket.id);
    if (userInfo) {
      const room = getRoom(userInfo.roomId);
      if (room) {
        // Check if DJ disconnected
        const isDJ = room.djs.find(d => d.userId === userInfo.userId);
        if (isDJ) {
          deleteRoom(userInfo.roomId);
        } else {
          // ✅ FIX: Remove from both users AND djs (in case they were promoted)
          room.users = room.users.filter(u => u.userId !== userInfo.userId);
          room.djs = room.djs.filter(d => d.userId !== userInfo.userId);
          io.to(userInfo.roomId).emit('user:left', {
            userId: userInfo.userId,
          });
        }
      }
      socketToUser.delete(socket.id);
      userSockets.delete(userInfo.userId);
    }
    console.log(`❌ [Socket] User disconnected: ${socket.id}`);
  });

  // Error handler
  socket.on('error', (error) => {
    console.error(`[Socket Error] ${socket.id}:`, error);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Party Room backend running on port ${PORT}`);
  console.log(`🌐 CORS enabled for: ${corsOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
