import type { FastifyPluginAsync } from 'fastify';
const prekeyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ message: 'PreKeys route - TODO' }));
};
export default prekeyRoutes;
