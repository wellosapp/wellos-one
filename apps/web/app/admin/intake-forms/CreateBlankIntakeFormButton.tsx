import { createBlankIntakeFormAction } from './actions';
import { Button } from '@/components/ui/Button';

export function CreateBlankIntakeFormButton() {
  return (
    <form action={createBlankIntakeFormAction}>
      <Button type="submit" variant="accent" size="md">
        New blank form
      </Button>
    </form>
  );
}
