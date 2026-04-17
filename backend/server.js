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

  socket.on('room:join', (data) => {
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

    // Check room capacity
    if (room.users.length + room.djs.length >= room.maxUsers) {
      socket.emit('error', { type: 'ROOM_FULL', message: 'Room is full' });
      console.log(`[Error] Room ${roomId} is full`);
      return;
    }

    // Add user to room (both public and private rooms join directly now)
    const user = { userId, partyName, socketId: socket.id, role: 'guest' };
    room.users.push(user);
    
    socket.join(room.id);
    socketToUser.set(socket.id, { userId, roomId });
    userSockets.set(userId, socket.id);

    // Send room state to new user
    socket.emit('room:joined', {
      roomId: room.id,
      roomName: room.name,
      roomType: room.type,
      userId,
      role: 'guest',
      djs: room.djs,
      users: room.users,
      bucket: room.bucket,
      currentSong: room.currentSong,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
    });

    // Notify others that user joined
    io.to(room.id).emit('user:joined', {
      userId,
      partyName,
      role: 'guest',
    });

    console.log(`[Socket] ${partyName} joined room ${roomId}`);
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
      
      // Notify removed user
      const userSocket = userSockets.get(userIdToRemove);
      if (userSocket) {
        io.to(userSocket).emit('user:removed', { reason: 'DJ removed you from room' });
        io.sockets.sockets.get(userSocket)?.leave(roomId);
      }

      // Notify room that user was removed
      io.to(roomId).emit('user:removed', {
        userId: userIdToRemove,
        partyName: userToRemove.partyName,
      });

      console.log(`[User] ${userToRemove.partyName} removed from ${roomId} by DJ`);
    }
  });

  // DJ Controls - Play
  socket.on('playback:play', (data) => {
    const { roomId, currentSong, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.currentSong = currentSong;
    room.currentTime = currentTime || 0;
    room.isPlaying = true;

    io.to(roomId).emit('playback:play', {
      currentSong,
      currentTime,
    });

    console.log(`[Playback] Playing: ${currentSong?.title} in ${roomId}`);
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
    if (!room) return;

    // Get next from bucket
    if (room.bucket.length > 0) {
      const nextItem = room.bucket.shift();
      room.currentSong = {
        id: nextItem.songId,
        title: nextItem.title,
        artist: nextItem.artist,
        image: nextItem.image,
      };
    } else {
      room.currentSong = null;
    }

    room.currentTime = 0;
    room.isPlaying = room.currentSong ? true : false;

    io.to(roomId).emit('playback:next', {
      currentSong: room.currentSong,
    });

    console.log(`[Playback] Skipped to next in ${roomId}`);
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
    if (!room) return;

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
    console.log(`[Bucket] Added to ${roomId}: ${title} (source: ${source}, hasAudio: ${!!audio})`);
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
      // Guest left - remove from users
      room.users = room.users.filter(u => u.userId !== userInfo.userId);
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
          room.users = room.users.filter(u => u.userId !== userInfo.userId);
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
