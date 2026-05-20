import type { SendSmsInput, SendSmsResult, SmsProvider } from './sms-provider.js';

/**
 * Production adapter: TextLink `POST /api/send-sms` (Bearer API key).
 * Wire `TEXTLINK_API_KEY` at the callsite when enabling real sends.
 */
export class TextLinkSmsProvider implements SmsProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      defaultSimCardId?: number;
    },
  ) {}

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    if (!this.options.apiKey) {
      return { ok: false, error: 'TextLink API key not configured' };
    }

    // TODO(Epic 8): fetch() + `ok` body check + SIM routing.
    void input;
    return {
      ok: false,
      error: 'TextLinkSmsProvider.sendSms not implemented — add fetch + SIM routing',
    };
  }
}
