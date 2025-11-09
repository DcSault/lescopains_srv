import Redis from 'ioredis';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

/**
 * Client Redis pour cache, présence, pub/sub
 */
export const redis = new Redis(config.redisUrl, {
  password: config.redisPassword,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect si Redis passe en read-only
      return true;
    }
    return false;
  },
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

// Events
redis.on('connect', () => {
  logger.info('Redis connection established');
});

redis.on('ready', () => {
  logger.info('Redis ready to accept commands');
});

redis.on('error', (error) => {
  logger.error(error, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

/**
 * Helpers Redis pour présence
 */
export const presenceService = {
  /**
   * Marquer un user comme online
   */
  async setOnline(userId: string, ttl = 60): Promise<void> {
    await redis.setex(`presence:${userId}`, ttl, 'online');
  },

  /**
   * Marquer un user comme offline
   */
  async setOffline(userId: string): Promise<void> {
    await redis.del(`presence:${userId}`);
  },

  /**
   * Vérifier si un user est online
   */
  async isOnline(userId: string): Promise<boolean> {
    const status = await redis.get(`presence:${userId}`);
    return status === 'online';
  },

  /**
   * Obtenir tous les users online
   */
  async getOnlineUsers(): Promise<string[]> {
    const keys = await redis.keys('presence:*');
    return keys.map((key) => key.replace('presence:', ''));
  },

  /**
   * Définir un custom status
   */
  async setStatus(userId: string, status: string, ttl = 60): Promise<void> {
    await redis.setex(`status:${userId}`, ttl, status);
  },

  /**
   * Obtenir le custom status
   */
  async getStatus(userId: string): Promise<string | null> {
    return redis.get(`status:${userId}`);
  },
};

/**
 * Helpers pour rate limiting distribué
 */
export const rateLimitService = {
  /**
   * Incrémenter le compteur de rate limit
   */
  async increment(key: string, windowMs: number): Promise<number> {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    return count;
  },

  /**
   * Vérifier si la limite est atteinte
   */
  async isLimitReached(key: string, max: number, windowMs: number): Promise<boolean> {
    const count = await this.increment(key, windowMs);
    return count > max;
  },
};

/**
 * Pub/Sub pour événements temps réel
 */
export const pubsubService = {
  /**
   * Publier un événement
   */
  async publish(channel: string, message: object): Promise<void> {
    await redis.publish(channel, JSON.stringify(message));
  },

  /**
   * S'abonner à un channel
   */
  subscribe(channel: string, callback: (message: any) => void): void {
    const subscriber = redis.duplicate();
    subscriber.subscribe(channel);
    subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(msg));
        } catch (error) {
          logger.error(error, 'Error parsing pubsub message');
        }
      }
    });
  },
};
