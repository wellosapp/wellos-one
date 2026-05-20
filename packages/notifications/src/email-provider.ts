/**
 * Outbound transactional email — implemented by Postmark (production) and no-op (tests).
 */
export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  /** Correlates provider webhooks / bounces back to our dispatch row (future). */
  metadata?: Record<string, string>;
  /** Postmark Message Stream id (e.g. `outbound` vs `broadcast`). */
  messageStream?: string;
};

export type SendTransactionalEmailResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string };

export interface EmailProvider {
  sendTransactional(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult>;
}
