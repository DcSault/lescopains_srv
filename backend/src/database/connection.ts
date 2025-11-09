import postgres from 'postgres';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

/**
 * Connexion PostgreSQL avec postgres.js
 * Plus performant et moderne que pg
 */
export const db = postgres(config.databaseUrl, {
  max: 20, // Pool size
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Ignorer les notices PostgreSQL
  transform: {
    undefined: null, // Transformer undefined en NULL
  },
  debug: config.isDevelopment,
});

/**
 * Test de connexion
 */
export async function testConnection(): Promise<boolean> {
  try {
    await db`SELECT 1 as test`;
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error(error, 'Database connection failed');
    return false;
  }
}

/**
 * Ferme la connexion proprement
 */
export async function closeConnection(): Promise<void> {
  await db.end();
  logger.info('Database connection closed');
}
