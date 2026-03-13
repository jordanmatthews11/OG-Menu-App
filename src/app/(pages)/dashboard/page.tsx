
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// This page is deprecated and now redirects to the categories page.
export default function DeprecatedDashboardPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/categories');
    }, [router]);

    return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Redirecting...</p>
        </div>
    );
}
