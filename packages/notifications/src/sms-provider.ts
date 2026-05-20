/**
 * Outbound staff/client SMS — implemented by TextLink (production) and no-op (tests).
 */
export type SendSmsInput = {
  toE164: string;
  body: string;
  /** TextLink SIM id; routing rules live in the orchestrator (future). */
  simCardId?: number;
  /** Returned on failed-message webhooks for correlation. */
  customId?: string;
};

export type SendSmsResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string };

export interface SmsProvider {
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
}
