import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '@/database/connection.js';
import { redis } from '@/database/redis.js';

// ============================================================================
// SCHEMAS DE VALIDATION
// ============================================================================

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

// ============================================================================
// ROUTES D'AUTHENTIFICATION
// ============================================================================

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/auth/register
   * Créer un nouveau compte utilisateur
   */
  fastify.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    // Vérifier si l'email existe déjà
    const existingUser = await db`
      SELECT id FROM users WHERE email = ${body.email} OR username = ${body.username}
    `;

    if (existingUser.length > 0) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Email or username already exists',
      });
    }

    // Hasher le mot de passe
    const passwordHash = await bcrypt.hash(body.password, 12);

    // Créer l'utilisateur
    const [user] = await db`
      INSERT INTO users (username, email, password_hash)
      VALUES (${body.username}, ${body.email}, ${passwordHash})
      RETURNING id, username, email, avatar_url, created_at
    `;

    // Générer JWT
    const accessToken = fastify.jwt.sign(
      { userId: user.id, username: user.username },
      { expiresIn: '15m' }
    );

    const refreshToken = fastify.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    // Stocker le refresh token
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await db`
      INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
      VALUES (
        ${user.id},
        ${tokenHash},
        ${JSON.stringify(request.headers['user-agent'])},
        ${request.ip},
        NOW() + INTERVAL '7 days'
      )
    `;

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      },
      accessToken,
      refreshToken,
    };
  });

  /**
   * POST /api/auth/login
   * Se connecter
   */
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    // Trouver l'utilisateur
    const [user] = await db`
      SELECT id, username, email, password_hash, avatar_url, status
      FROM users
      WHERE email = ${body.email} AND deleted_at IS NULL
    `;

    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(body.password, user.password_hash);
    if (!validPassword) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Générer tokens
    const accessToken = fastify.jwt.sign(
      { userId: user.id, username: user.username },
      { expiresIn: '15m' }
    );

    const refreshToken = fastify.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    // Stocker le refresh token
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await db`
      INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
      VALUES (
        ${user.id},
        ${tokenHash},
        ${JSON.stringify(request.headers['user-agent'])},
        ${request.ip},
        NOW() + INTERVAL '7 days'
      )
    `;

    // Marquer comme online dans Redis
    await redis.setex(`presence:${user.id}`, 60, 'online');

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        status: user.status,
      },
      accessToken,
      refreshToken,
    };
  });

  /**
   * POST /api/auth/refresh
   * Rafraîchir l'access token
   */
  fastify.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    try {
      const decoded = fastify.jwt.verify(body.refreshToken) as any;

      if (decoded.type !== 'refresh') {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token type',
        });
      }

      // Vérifier si le token existe et n'est pas révoqué
      const tokenHash = await bcrypt.hash(body.refreshToken, 10);
      const [token] = await db`
        SELECT id FROM refresh_tokens
        WHERE user_id = ${decoded.userId}
        AND expires_at > NOW()
        AND revoked_at IS NULL
        LIMIT 1
      `;

      if (!token) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Token not found or expired',
        });
      }

      // Générer un nouveau access token
      const accessToken = fastify.jwt.sign(
        { userId: decoded.userId },
        { expiresIn: '15m' }
      );

      return { accessToken };
    } catch (error) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Se déconnecter (révoquer le refresh token)
   */
  fastify.post('/logout', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user as any;

    // Révoquer tous les refresh tokens de l'utilisateur
    await db`
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = ${user.userId} AND revoked_at IS NULL
    `;

    // Retirer de Redis
    await redis.del(`presence:${user.userId}`);

    return { success: true };
  });

  /**
   * GET /api/auth/me
   * Obtenir les informations de l'utilisateur connecté
   */
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user as any;

    const [userData] = await db`
      SELECT id, username, email, avatar_url, banner_url, bio, status, custom_status, created_at
      FROM users
      WHERE id = ${user.userId} AND deleted_at IS NULL
    `;

    if (!userData) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found',
      });
    }

    return {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      avatarUrl: userData.avatar_url,
      bannerUrl: userData.banner_url,
      bio: userData.bio,
      status: userData.status,
      customStatus: userData.custom_status,
      createdAt: userData.created_at,
    };
  });
};

// ============================================================================
// DECORATOR POUR AUTHENTIFICATION
// ============================================================================

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
      userId: string;
      username: string;
    };
  }
}

export default authRoutes;
