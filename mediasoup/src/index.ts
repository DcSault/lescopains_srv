/**
 * Service mediasoup SFU pour LesCopains
 * Gestion audio/vidéo/partage d'écran temps réel avec E2EE
 */

import * as mediasoup from 'mediasoup';
import type { Worker, Router, WebRtcTransport } from 'mediasoup/node/lib/types.js';
import { createServer } from 'http';
import pino from 'pino';
import dotenv from 'dotenv';

dotenv.config();

// ==============================================================================
// CONFIGURATION
// ==============================================================================

const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  logLevel: (process.env.MEDIASOUP_LOG_LEVEL || 'warn') as mediasoup.types.WorkerLogLevel,
  numWorkers: parseInt(process.env.MEDIASOUP_NUM_WORKERS || '0', 10) || require('os').cpus().length,
  
  webRtc: {
    listenIp: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
    minPort: parseInt(process.env.MEDIASOUP_MIN_PORT || '40000', 10),
    maxPort: parseInt(process.env.MEDIASOUP_MAX_PORT || '40100', 10),
  },
  
  codecs: {
    audio: [
      {
        kind: 'audio' as mediasoup.types.MediaKind,
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
    ],
    video: [
      {
        kind: 'video' as mediasoup.types.MediaKind,
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video' as mediasoup.types.MediaKind,
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  },
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
// MEDIASOUP WORKERS & ROUTERS
// ==============================================================================

let workers: Worker[] = [];
let nextWorkerIdx = 0;
const routers = new Map<string, Router>(); // channelId -> Router

/**
 * Créer les workers mediasoup
 */
async function createWorkers() {
  for (let i = 0; i < config.numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.logLevel,
      rtcMinPort: config.webRtc.minPort,
      rtcMaxPort: config.webRtc.maxPort,
    });
    
    worker.on('died', () => {
      logger.error({ workerId: worker.pid }, 'mediasoup worker died, exiting...');
      process.exit(1);
    });
    
    workers.push(worker);
    logger.info({ workerId: worker.pid }, 'mediasoup worker created');
  }
}

/**
 * Obtenir le prochain worker (round-robin)
 */
function getNextWorker(): Worker {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

/**
 * Créer ou récupérer un router pour un channel
 */
async function getOrCreateRouter(channelId: string): Promise<Router> {
  if (routers.has(channelId)) {
    return routers.get(channelId)!;
  }
  
  const worker = getNextWorker();
  const router = await worker.createRouter({
    mediaCodecs: [...config.codecs.audio, ...config.codecs.video],
  });
  
  routers.set(channelId, router);
  logger.info({ channelId, workerId: worker.pid }, 'Router created for channel');
  
  return router;
}

// ==============================================================================
// TRANSPORTS & PRODUCERS/CONSUMERS
// ==============================================================================

const transports = new Map<string, WebRtcTransport>();
const producers = new Map<string, mediasoup.types.Producer>();
const consumers = new Map<string, mediasoup.types.Consumer>();

/**
 * Créer un WebRTC transport
 */
async function createWebRtcTransport(channelId: string, userId: string, direction: 'send' | 'recv') {
  const router = await getOrCreateRouter(channelId);
  
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: config.webRtc.listenIp,
        announcedIp: config.webRtc.announcedIp,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
  });
  
  const transportId = `${channelId}:${userId}:${direction}`;
  transports.set(transportId, transport);
  
  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed' || dtlsState === 'failed') {
      logger.warn({ transportId, dtlsState }, 'Transport closed/failed');
      transport.close();
      transports.delete(transportId);
    }
  });
  
  logger.info({ transportId, transportId: transport.id }, 'WebRTC transport created');
  
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

// ==============================================================================
// HTTP API
// ==============================================================================

const httpServer = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = new URL(req.url!, `http://${req.headers.host}`);
  
  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      workers: workers.length,
      routers: routers.size,
      transports: transports.size,
      timestamp: new Date().toISOString(),
    }));
    return;
  }
  
  // RTP Capabilities
  if (url.pathname === '/rtpCapabilities' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { channelId } = JSON.parse(body);
        const router = await getOrCreateRouter(channelId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ rtpCapabilities: router.rtpCapabilities }));
      } catch (error) {
        logger.error({ error }, 'Error getting RTP capabilities');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }
  
  // Create transport
  if (url.pathname === '/createTransport' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { channelId, userId, direction } = JSON.parse(body);
        const transportParams = await createWebRtcTransport(channelId, userId, direction);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(transportParams));
      } catch (error) {
        logger.error({ error }, 'Error creating transport');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }
  
  // Connect transport
  if (url.pathname === '/connectTransport' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { transportId, dtlsParameters } = JSON.parse(body);
        const transport = transports.get(transportId);
        
        if (!transport) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Transport not found' }));
          return;
        }
        
        await transport.connect({ dtlsParameters });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        logger.error({ error }, 'Error connecting transport');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }
  
  // Produce (send media)
  if (url.pathname === '/produce' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { transportId, kind, rtpParameters, appData } = JSON.parse(body);
        const transport = transports.get(transportId);
        
        if (!transport) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Transport not found' }));
          return;
        }
        
        const producer = await transport.produce({
          kind,
          rtpParameters,
          appData,
        });
        
        producers.set(producer.id, producer);
        
        logger.info({ producerId: producer.id, kind }, 'Producer created');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: producer.id }));
      } catch (error) {
        logger.error({ error }, 'Error creating producer');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }
  
  // Consume (receive media)
  if (url.pathname === '/consume' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { transportId, producerId, rtpCapabilities } = JSON.parse(body);
        const transport = transports.get(transportId);
        const producer = producers.get(producerId);
        
        if (!transport || !producer) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Transport or Producer not found' }));
          return;
        }
        
        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: false,
        });
        
        consumers.set(consumer.id, consumer);
        
        logger.info({ consumerId: consumer.id, producerId }, 'Consumer created');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }));
      } catch (error) {
        logger.error({ error }, 'Error creating consumer');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end('Not Found');
});

// ==============================================================================
// STARTUP
// ==============================================================================

async function start() {
  try {
    await createWorkers();
    
    httpServer.listen(config.port, '0.0.0.0', () => {
      logger.info(`mediasoup SFU listening on http://0.0.0.0:${config.port}`);
      logger.info(`WebRTC ports: ${config.webRtc.minPort}-${config.webRtc.maxPort}`);
      logger.info(`Workers: ${workers.length}`);
    });
  } catch (error) {
    logger.error(error, 'Failed to start mediasoup server');
    process.exit(1);
  }
}

// ==============================================================================
// GRACEFUL SHUTDOWN
// ==============================================================================

const shutdown = async () => {
  logger.info('Shutting down mediasoup server...');
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  
  for (const worker of workers) {
    worker.close();
  }
  
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
