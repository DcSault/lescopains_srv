import type { FastifyPluginAsync } from 'fastify';
const friendRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ message: 'Friends route - TODO' }));
};
export default friendRoutes;
