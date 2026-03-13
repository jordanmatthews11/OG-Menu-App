
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is deprecated and replaced by /categories which is now the main order builder.
// This component now just redirects to the new page.
export default function DeprecatedSubscriptionMenuPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/categories');
    }, [router]);

    return (
        <div className="flex items-center justify-center h-64">
            <p>Redirecting to the new Order Builder page...</p>
        </div>
    );
}
