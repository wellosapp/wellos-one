import type { StaffBookingFormChipStatus } from '@/lib/staff-booking/client-context-types';

export function bookingFormStatusLabel(status: StaffBookingFormChipStatus): string {
  switch (status) {
    case 'completed':
      return 'Done';
    case 'expired':
      return 'Expired';
    case 'pending':
      return 'Pending';
    case 'sent':
      return 'Sent';
    case 'required_before_visit':
      return 'Before visit';
    case 'required_before_booking':
      return 'Before booking';
  }
}

export function bookingFormBadgeTone(
  status: StaffBookingFormChipStatus,
): 'neutral' | 'accent' | 'red' | 'amber' | 'green' {
  switch (status) {
    case 'completed':
      return 'green';
    case 'expired':
      return 'red';
    case 'required_before_visit':
    case 'required_before_booking':
      return 'amber';
    case 'sent':
      return 'neutral';
    case 'pending':
      return 'neutral';
  }
}
