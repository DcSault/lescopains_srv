import { Server } from 'socket.io';
import { createServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import pino from 'pino';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

// ==============================================================================
// CONFIGURATION
// ==============================================================================

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://lescopains:password@localhost:5432/lescopains',
  jwtSecret: process.env.JWT_SECRET || 'CHANGE_ME',
  wsPath: process.env.WS_PATH || '/ws',
  corsOrigin: process.env.WS_CORS_ORIGIN || '*',
  pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000', 10),
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
  presenceTTL: parseInt(process.env.PRESENCE_TTL || '60', 10),
};

// ==============================================================================
// LOGGER
// ==============================================================================

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

// ==============================================================================
// DATABASE & REDIS
// ==============================================================================

const db = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

const redisClient = new Redis(config.redisUrl, {
  password: config.redisPassword,
});

const redisPub = redisClient.duplicate();
const redisSub = redisClient.duplicate();

// ==============================================================================
// HTTP SERVER & SOCKET.IO
// ==============================================================================

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const io = new Server(httpServer, {
  path: config.wsPath,
  cors: {
    origin: config.corsOrigin,
    credentials: true,
  },
  pingInterval: config.pingInterval,
  pingTimeout: config.pingTimeout,
  transports: ['websocket', 'polling'],
});

// Redis adapter pour scaling horizontal
io.adapter(createAdapter(redisPub, redisSub));

// ==============================================================================
// SOCKET.IO HANDLERS
// ==============================================================================

/**
 * Middleware d'authentification
 */
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  
  try {
    // Validation JWT simple (à améliorer avec vrai JWT verify)
    // Pour démo, on accepte tout token
    const userId = socket.handshake.auth.userId;
    
    if (!userId) {
      return next(new Error('Authentication error: Invalid token'));
    }
    
    socket.data.userId = userId;
    socket.data.username = socket.handshake.auth.username || 'Anonymous';
    
    logger.info({ userId, socketId: socket.id }, 'User authenticated');
    next();
  } catch (error) {
    logger.error({ error }, 'Authentication failed');
    next(new Error('Authentication error'));
  }
});

/**
 * Connection handler
 */
io.on('connection', async (socket) => {
  const userId = socket.data.userId;
  const username = socket.data.username;
  
  logger.info({ userId, username, socketId: socket.id }, 'Client connected');
  
  // Marquer comme online dans Redis
  await redisClient.setex(`presence:${userId}`, config.presenceTTL, 'online');
  await redisClient.sadd('online_users', userId);
  
  // Broadcast présence
  socket.broadcast.emit('user:online', { userId, username });
  
  // ===========================================================================
  // PRÉSENCE
  // ===========================================================================
  
  socket.on('presence:update', async (data) => {
    const { status, customStatus } = data;
    
    if (!['online', 'idle', 'dnd', 'offline'].includes(status)) {
      return;
    }
    
    // Update DB
    await db`
      UPDATE users
      SET status = ${status}, custom_status = ${customStatus || null}
      WHERE id = ${userId}
    `;
    
    // Update Redis
    await redisClient.setex(`status:${userId}`, config.presenceTTL, status);
    if (customStatus) {
      await redisClient.setex(`custom_status:${userId}`, config.presenceTTL, customStatus);
    }
    
    // Broadcast
    io.emit('user:presence', { userId, status, customStatus });
    
    logger.info({ userId, status }, 'Presence updated');
  });
  
  // Heartbeat pour garder présence active
  socket.on('presence:ping', async () => {
    await redisClient.expire(`presence:${userId}`, config.presenceTTL);
  });
  
  // ===========================================================================
  // CHANNELS & MESSAGES
  // ===========================================================================
  
  socket.on('channel:join', async (data) => {
    const { channelId } = data;
    
    // Vérifier permissions (TODO)
    
    await socket.join(`channel:${channelId}`);
    logger.info({ userId, channelId }, 'User joined channel');
    
    // Notify others
    socket.to(`channel:${channelId}`).emit('user:joined_channel', { userId, channelId });
  });
  
  socket.on('channel:leave', async (data) => {
    const { channelId } = data;
    
    await socket.leave(`channel:${channelId}`);
    logger.info({ userId, channelId }, 'User left channel');
    
    socket.to(`channel:${channelId}`).emit('user:left_channel', { userId, channelId });
  });
  
  socket.on('message:send', async (data) => {
    const { channelId, content, metadata } = data;
    
    // Sauvegarder en DB (via API backend normalement)
    // Ici on broadcast juste
    
    const message = {
      id: crypto.randomUUID(),
      channelId,
      authorId: userId,
      content,
      metadata,
      createdAt: new Date().toISOString(),
    };
    
    // Broadcast to channel
    io.to(`channel:${channelId}`).emit('message:new', message);
    
    logger.info({ userId, channelId, messageId: message.id }, 'Message sent');
  });
  
  socket.on('message:typing', async (data) => {
    const { channelId } = data;
    socket.to(`channel:${channelId}`).emit('user:typing', { userId, channelId });
  });
  
  // ===========================================================================
  // WEBRTC SIGNALING
  // ===========================================================================
  
  socket.on('voice:join', async (data) => {
    const { channelId } = data;
    
    await socket.join(`voice:${channelId}`);
    
    // Save voice session in DB
    await db`
      INSERT INTO voice_sessions (channel_id, user_id)
      VALUES (${channelId}, ${userId})
      ON CONFLICT (channel_id, user_id) WHERE left_at IS NULL
      DO UPDATE SET joined_at = NOW()
    `;
    
    // Notify others in voice channel
    socket.to(`voice:${channelId}`).emit('voice:user_joined', {
      userId,
      channelId,
    });
    
    logger.info({ userId, channelId }, 'User joined voice channel');
    
    // Return list of users already in voice
    const voiceUsers = await db`
      SELECT user_id, muted, deafened, screen_sharing, video
      FROM voice_sessions
      WHERE channel_id = ${channelId} AND left_at IS NULL AND user_id != ${userId}
    `;
    
    socket.emit('voice:users', { channelId, users: voiceUsers });
  });
  
  socket.on('voice:leave', async (data) => {
    const { channelId } = data;
    
    await socket.leave(`voice:${channelId}`);
    
    // Update DB
    await db`
      UPDATE voice_sessions
      SET left_at = NOW()
      WHERE channel_id = ${channelId} AND user_id = ${userId} AND left_at IS NULL
    `;
    
    socket.to(`voice:${channelId}`).emit('voice:user_left', { userId, channelId });
    
    logger.info({ userId, channelId }, 'User left voice channel');
  });
  
  socket.on('voice:state', async (data) => {
    const { channelId, muted, deafened, screenSharing, video } = data;
    
    // Update DB
    await db`
      UPDATE voice_sessions
      SET
        muted = ${muted ?? false},
        deafened = ${deafened ?? false},
        screen_sharing = ${screenSharing ?? false},
        video = ${video ?? false}
      WHERE channel_id = ${channelId} AND user_id = ${userId} AND left_at IS NULL
    `;
    
    // Broadcast state
    socket.to(`voice:${channelId}`).emit('voice:state_changed', {
      userId,
      muted,
      deafened,
      screenSharing,
      video,
    });
  });
  
  // WebRTC Signaling (SDP exchange)
  socket.on('webrtc:offer', (data) => {
    const { targetUserId, offer, channelId } = data;
    
    // Envoyer l'offer au peer ciblé
    io.to(`voice:${channelId}`).emit('webrtc:offer', {
      fromUserId: userId,
      offer,
    });
  });
  
  socket.on('webrtc:answer', (data) => {
    const { targetUserId, answer, channelId } = data;
    
    io.to(`voice:${channelId}`).emit('webrtc:answer', {
      fromUserId: userId,
      answer,
    });
  });
  
  socket.on('webrtc:ice_candidate', (data) => {
    const { targetUserId, candidate, channelId } = data;
    
    io.to(`voice:${channelId}`).emit('webrtc:ice_candidate', {
      fromUserId: userId,
      candidate,
    });
  });
  
  // ===========================================================================
  // DISCONNECT
  // ===========================================================================
  
  socket.on('disconnect', async (reason) => {
    logger.info({ userId, socketId: socket.id, reason }, 'Client disconnected');
    
    // Remove from online users
    await redisClient.del(`presence:${userId}`);
    await redisClient.srem('online_users', userId);
    
    // Leave all voice channels
    await db`
      UPDATE voice_sessions
      SET left_at = NOW()
      WHERE user_id = ${userId} AND left_at IS NULL
    `;
    
    // Broadcast offline
    io.emit('user:offline', { userId });
  });
});

// ==============================================================================
// GRACEFUL SHUTDOWN
// ==============================================================================

const shutdown = async () => {
  logger.info('Shutting down signaling server...');
  
  io.close(() => {
    logger.info('Socket.IO server closed');
  });
  
  await db.end();
  await redisClient.quit();
  await redisPub.quit();
  await redisSub.quit();
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ==============================================================================
// START SERVER
// ==============================================================================

httpServer.listen(config.port, '0.0.0.0', () => {
  logger.info(`Signaling server listening on http://0.0.0.0:${config.port}`);
  logger.info(`WebSocket path: ${config.wsPath}`);
});
