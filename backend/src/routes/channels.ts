import type { FastifyPluginAsync } from 'fastify';
const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ message: 'Channels route - TODO' }));
};
export default channelRoutes;
