'use client';

import { useFirebase, useUser, handleGoogleSignIn } from '@/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Simple SVG for Google Icon
const GoogleIcon = () => (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path>
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path>
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A8 8 0 0 1 24 36c-5.225 0-9.652-3.512-11.28-8.286l-6.522 5.025C9.505 39.556 16.227 44 24 44z"></path>
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C44.591 35.013 48 29.827 48 24c0-1.341-.138-2.65-.389-3.917z"></path>
    </svg>
);


export default function LoginForm() {
  const { auth } = useFirebase();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Redirect if user is already logged in
  useEffect(() => {
    if (!isUserLoading && user) {
      const redirectUrl = searchParams.get('redirect_to') || '/categories';
      router.replace(redirectUrl);
    }
  }, [user, isUserLoading, router, searchParams]);

  const onSignInClick = async () => {
    setIsSigningIn(true);
    setError(null);
    try {
      await handleGoogleSignIn(auth);
      // The useEffect above will handle redirection on successful login
    } catch (err: any) {
      console.error("Sign-in failed:", err);
      setError(err.message || "An unknown error occurred during sign-in.");
      setIsSigningIn(false);
    }
  };

  // Prevent rendering the button if we're already logged in and about to redirect
  if (user) {
    return (
      <div className="text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
        <p className="text-muted-foreground">Already signed in. Redirecting...</p>
      </div>
    );
  }
  
  if (isUserLoading) {
      return (
          <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Checking authentication status...</p>
          </div>
      )
  }

  return (
    <div className="w-full">
      <Button 
        onClick={onSignInClick} 
        disabled={isSigningIn}
        className="w-full"
        size="lg"
      >
        {isSigningIn ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        {isSigningIn ? 'Signing In...' : 'Sign in with Google'}
      </Button>
      {error && <p className="text-sm text-destructive mt-4 text-center">{error}</p>}
    </div>
  );
}
