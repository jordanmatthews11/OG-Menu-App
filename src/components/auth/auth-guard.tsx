"use client";

import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, Package2 } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-center">
        <div className="flex items-center text-lg text-muted-foreground">
            <Package2 className="mr-4 h-8 w-8" />
            <Loader2 className="h-6 w-6 animate-spin mr-4" />
            <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  // This return is for the brief moment before the redirect happens.
  // It can show a loader or just be null.
  return (
     <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-center">
        <div className="flex items-center text-lg text-muted-foreground">
            <Package2 className="mr-4 h-8 w-8" />
            <Loader2 className="h-6 w-6 animate-spin mr-4" />
            <span>Redirecting to login...</span>
        </div>
      </div>
  );
}
