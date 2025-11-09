import type { FastifyPluginAsync } from 'fastify';
const messageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ message: 'Messages route - TODO' }));
};
export default messageRoutes;
