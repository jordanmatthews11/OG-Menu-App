
'use server';

import type { SupportRequest, Category } from '@/lib/types';

const ZAPIER_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/23139831/uqnhsrh/';

// TODO: Replace this with your actual Zapier webhook URL for category updates.
const ZAPIER_CATEGORY_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/23139831/uqjzggp/';


/**
 * A server action to notify Zapier when a support ticket is completed.
 * @param ticket The support ticket data.
 */
export async function notifyZapier(ticket: SupportRequest): Promise<{ success: boolean, error?: string }> {
    if (!ticket || ticket.status !== 'Complete') {
        console.log('Zapier notification skipped: Ticket is null or not complete.');
        return { success: true }; // Not an error, just skipped.
    }

    console.log(`Sending notification to Zapier for completed ticket: ${ticket.id}`);

    try {
        const response = await fetch(ZAPIER_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ticket),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Zapier notification failed with status ${response.status}:`, errorBody);
            return { success: false, error: `Zapier returned status ${response.status}` };
        }
        
        console.log(`Successfully notified Zapier for ticket: ${ticket.id}`);
        return { success: true };

    } catch (error) {
        console.error('Failed to send request to Zapier:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * A server action to notify Zapier when a category is created or updated.
 * @param category The category data.
 */
export async function notifyCategoryUpdate(category: Category): Promise<{ success: boolean, error?: string }> {
    if (ZAPIER_CATEGORY_WEBHOOK_URL.includes('YOUR_ZAP_ID')) {
        console.log('Zapier category notification skipped: Placeholder URL is not replaced.');
        return { success: true };
    }
    
    console.log(`Sending notification to Zapier for category update: ${category.id}`);

    try {
        const response = await fetch(ZAPIER_CATEGORY_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(category),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Zapier category notification failed with status ${response.status}:`, errorBody);
            return { success: false, error: `Zapier returned status ${response.status}` };
        }
        
        console.log(`Successfully notified Zapier for category: ${category.id}`);
        return { success: true };

    } catch (error) {
        console.error('Failed to send category update to Zapier:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
