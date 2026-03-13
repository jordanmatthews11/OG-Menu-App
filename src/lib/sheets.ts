
'use server';

import type { SupportRequest } from '@/lib/types';

// This function is now disabled and will not be called.
export async function addSupportTicketToSheet(ticket: SupportRequest): Promise<{ success: boolean; message: string }> {
  return {
    success: true,
    message: 'Google Sheets integration is disabled.',
  };
}
