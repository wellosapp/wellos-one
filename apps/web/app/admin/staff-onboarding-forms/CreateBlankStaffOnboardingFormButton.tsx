import { createBlankStaffOnboardingFormAction } from './actions';
import { Button } from '@/components/ui/Button';

export function CreateBlankStaffOnboardingFormButton() {
  return (
    <form action={createBlankStaffOnboardingFormAction}>
      <Button type="submit" variant="accent" size="md">
        New blank form
      </Button>
    </form>
  );
}
