import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

/**
 * Configuration de l'application
 */
export const config = {
  // Environnement
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',

  // Serveur
  port: parseInt(process.env.PORT || '3000', 10),
  
  // Base de données
  databaseUrl: process.env.DATABASE_URL || 'postgresql://lescopains:password@localhost:5432/lescopains',
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD,
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  
  // E2EE
  serverSigningKey: process.env.SERVER_SIGNING_KEY || 'CHANGE_ME_IN_PRODUCTION',
  
  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',
  
  // Rate Limiting
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
  },
  
  // Upload
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // URLs internes
  signalingUrl: process.env.SIGNALING_URL || 'http://localhost:3001',
  mediasoupUrl: process.env.MEDIASOUP_URL || 'http://localhost:3003',
} as const;

/**
 * Valide la configuration au démarrage
 */
export function validateConfig(): void {
  const errors: string[] = [];

  if (config.isProduction) {
    if (config.jwtSecret === 'CHANGE_ME_IN_PRODUCTION') {
      errors.push('JWT_SECRET must be set in production');
    }
    
    if (config.serverSigningKey === 'CHANGE_ME_IN_PRODUCTION') {
      errors.push('SERVER_SIGNING_KEY must be set in production');
    }
    
    if (!config.databaseUrl.includes('postgresql://')) {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

// Valider au chargement
validateConfig();
