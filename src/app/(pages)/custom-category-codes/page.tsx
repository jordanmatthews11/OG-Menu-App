
"use client";

// This page is deprecated. The functionality to view and manage custom codes
// may be re-integrated into the main Code Directory or another appropriate page in the future.
// For now, it redirects to the dashboard.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function DeprecatedCustomCategoryCodesPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard');
    }, [router]);

    return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">This page is no longer in use.</p>
            <p className="text-muted-foreground">Redirecting to the dashboard...</p>
        </div>
    );
}

    