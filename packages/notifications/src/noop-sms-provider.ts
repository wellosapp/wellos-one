import type { SendSmsInput, SendSmsResult, SmsProvider } from './sms-provider.js';

export class NoopSmsProvider implements SmsProvider {
  async sendSms(_input: SendSmsInput): Promise<SendSmsResult> {
    return { ok: true };
  }
}
