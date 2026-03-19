/**
 * POST /api/email/inbound
 *
 * SendGrid Inbound Parse webhook endpoint.
 * Accepts application/x-www-form-urlencoded (SendGrid default) or
 * application/json (for testing).
 *
 * Rate limit: enforced externally via nginx/Cloudflare.
 * Auth: no auth header — SendGrid posts anonymously.
 *       Sender verification is handled inside EmailIngestService.
 */
import type { FastifyInstance } from 'fastify';
import { handleInboundEmail, type EmailIngestDeps } from '../services/email-ingest.service.js';

export interface EmailIngestRouteOptions {
  deps: EmailIngestDeps;
}

export async function emailIngestRoute(
  fastify: FastifyInstance,
  options: EmailIngestRouteOptions,
): Promise<void> {
  fastify.post<{
    Body: {
      from?: string;
      to?: string;
      subject?: string;
      text?: string;
      html?: string;
      timestamp?: string;
    };
  }>('/api/email/inbound', async (request, reply) => {
    const body = request.body ?? {};

    const payload = {
      from: body.from ?? '',
      to: body.to ?? '',
      subject: body.subject ?? '',
      text: body.text ?? '',
      html: body.html ?? '',
      receivedAt: body.timestamp ? Number(body.timestamp) : undefined,
    };

    // Basic presence check — missing from/to is always a reject.
    if (!payload.from || !payload.to) {
      return reply.status(400).send({ error: 'missing-fields' });
    }

    const result = await handleInboundEmail(payload, options.deps);

    // Always return 200 to the email provider (prevents retries on rejections).
    return reply.status(200).send({ status: result.status });
  });
}
