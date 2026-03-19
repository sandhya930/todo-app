/**
 * Server entry point.
 * Registers routes and starts the Fastify HTTP server.
 */
import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { emailIngestRoute } from './routes/email-ingest.route.js';
import { notifyUser } from './lib/sse-notifier.js';
import { getIngestSecret } from './lib/email-address.js';

const PORT = Number(process.env['PORT'] ?? 3001);

async function start() {
  const fastify = Fastify({ logger: true });
  await fastify.register(formbody);

  // Wire up email ingest route with production deps.
  // Prisma client and SSE notifier are injected here.
  await fastify.register(emailIngestRoute, {
    deps: {
      ingestSecret: getIngestSecret(),
      findUserByToken: async (_token) => {
        // TODO(Story 1.4): replace with Prisma lookup:
        // return prisma.user.findFirst({ where: { email_ingest_address: { contains: token } } });
        throw new Error('findUserByToken not implemented — requires Prisma setup (Story 1.4)');
      },
      persistTask: async (_input) => {
        // TODO(Story 1.4): replace with Prisma create:
        // return prisma.task.create({ data: { ...input, id: uuidv7() } });
        throw new Error('persistTask not implemented — requires Prisma setup (Story 1.4)');
      },
      notifyUser: (userId, task) => notifyUser(userId, { taskId: task.id, title: task.title }),
    },
  });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
