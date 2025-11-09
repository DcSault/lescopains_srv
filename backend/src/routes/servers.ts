import type { FastifyPluginAsync } from 'fastify';
const serverRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ message: 'Servers route - TODO' }));
};
export default serverRoutes;
