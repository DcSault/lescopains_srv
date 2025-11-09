import type { FastifyPluginAsync } from 'fastify';
const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ message: 'Users route - TODO' }));
};
export default userRoutes;
