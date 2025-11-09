import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { config } from '@/config/index.js';
import { db } from '@/database/connection.js';
import { redis } from '@/database/redis.js';
import { logger } from '@/utils/logger.js';

// Routes
import authRoutes from '@/routes/auth.js';
import userRoutes from '@/routes/users.js';
import serverRoutes from '@/routes/servers.js';
import channelRoutes from '@/routes/channels.js';
import messageRoutes from '@/routes/messages.js';
import friendRoutes from '@/routes/friends.js';
import prekeyRoutes from '@/routes/prekeys.js';

/**
 * Crée et configure l'instance Fastify
 */
export async function buildApp() {
  const app = Fastify({
    logger: logger,
    requestIdHeader: 'x-request-id',
    trustProxy: true,
    bodyLimit: config.maxFileSize,
    caseSensitive: true,
    ignoreTrailingSlash: true,
  });

  // ============================================================================
  // PLUGINS DE SÉCURITÉ
  // ============================================================================

  // Helmet - Headers de sécurité
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", config.corsOrigin],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // CORS
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });

  // Rate Limiting
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
    cache: 10000,
    redis: redis,
    skipOnError: false,
    keyGenerator: (request) => {
      return request.headers['x-forwarded-for'] as string || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${context.after}`,
      };
    },
  });

  // JWT
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtAccessExpiry,
    },
  });

  // Multipart (upload de fichiers)
  await app.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: config.maxFileSize,
      fields: 10,
      fileSize: config.maxFileSize,
      files: 1,
      headerPairs: 2000,
    },
  });

  // ============================================================================
  // HOOKS
  // ============================================================================

  // Hook pour logger toutes les requêtes
  app.addHook('onRequest', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    }, 'Incoming request');
  });

  // Hook pour mesurer le temps de réponse
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.getResponseTime(),
    }, 'Request completed');
  });

  // Hook pour gérer les erreurs
  app.setErrorHandler((error, request, reply) => {
    request.log.error({
      err: error,
      method: request.method,
      url: request.url,
    }, 'Request error');

    // Erreurs de validation
    if (error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation error',
        details: error.validation,
      });
    }

    // Erreurs JWT
    if (error.statusCode === 401) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Erreurs génériques
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Internal Server Error',
      message: config.nodeEnv === 'production' ? 'An error occurred' : error.message,
    });
  });

  // ============================================================================
  // ROUTES
  // ============================================================================

  // Health check
  app.get('/health', async (request, reply) => {
    try {
      // Vérifier la connexion DB
      await db`SELECT 1`;
      
      // Vérifier Redis
      await redis.ping();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        version: '1.0.0',
      };
    } catch (error) {
      reply.status(503);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Metrics (optionnel)
  app.get('/metrics', async (request, reply) => {
    const memoryUsage = process.memoryUsage();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      cpu: process.cpuUsage(),
    };
  });

  // Register routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(serverRoutes, { prefix: '/api/servers' });
  await app.register(channelRoutes, { prefix: '/api/channels' });
  await app.register(messageRoutes, { prefix: '/api/messages' });
  await app.register(friendRoutes, { prefix: '/api/friends' });
  await app.register(prekeyRoutes, { prefix: '/api/prekeys' });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
    });
  });

  return app;
}

/**
 * Démarre le serveur
 */
async function start() {
  try {
    const app = await buildApp();

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        app.log.info(`Received ${signal}, closing server...`);
        
        try {
          await app.close();
          await db.end();
          await redis.quit();
          app.log.info('Server closed gracefully');
          process.exit(0);
        } catch (error) {
          app.log.error(error, 'Error during shutdown');
          process.exit(1);
        }
      });
    });

    // Start server
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    app.log.info(`Server listening on http://0.0.0.0:${config.port}`);
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Start if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
