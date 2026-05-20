import type {
  EmailProvider,
  SendTransactionalEmailInput,
  SendTransactionalEmailResult,
} from './email-provider.js';

export class NoopEmailProvider implements EmailProvider {
  async sendTransactional(
    _input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    return { ok: true };
  }
}
