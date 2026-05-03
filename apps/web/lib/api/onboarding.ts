import { apiFetch } from './client';

/** Mirrors GET /admin/onboarding/status until the wizard ships. */
export type OnboardingStatusResponse = {
  status: 'not_configured';
  message: string;
};

export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  return apiFetch<OnboardingStatusResponse>('/admin/onboarding/status');
}
