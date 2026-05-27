// API error type shared between server-only fetchers (lib/api/client.ts)
// and client-component fetchers (lib/api/public-forms.ts). Lives in its own
// module — free of Clerk imports — so client components can `import { ApiError }`
// without webpack pulling `@clerk/nextjs/server` into the client bundle.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
