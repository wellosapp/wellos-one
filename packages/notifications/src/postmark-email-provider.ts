import type {
  EmailProvider,
  SendTransactionalEmailInput,
  SendTransactionalEmailResult,
} from './email-provider.js';

/**
 * Production adapter: Postmark Server API (HTTP).
 * Wire `POSTMARK_SERVER_TOKEN` / streams at the callsite when enabling real sends.
 */
export class PostmarkEmailProvider implements EmailProvider {
  constructor(
    private readonly options: {
      serverToken: string;
      defaultFrom: string;
      defaultStream: string;
    },
  ) {}

  async sendTransactional(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    if (!this.options.serverToken) {
      return { ok: false, error: 'Postmark server token not configured' };
    }

    // TODO(Epic 8): fetch() to api.postmarkapp.com + structured errors.
    void input;
    return {
      ok: false,
      error:
        'PostmarkEmailProvider.sendTransactional not implemented — add fetch + error mapping',
    };
  }
}
