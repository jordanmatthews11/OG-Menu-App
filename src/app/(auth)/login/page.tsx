"use client";

import { Suspense } from 'react';
import LoginForm from '@/components/auth/login-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Package2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Suspense fallback={
        <div className="flex items-center text-lg text-muted-foreground">
          <Package2 className="mr-2 h-6 w-6" /> Loading Login...
        </div>
      }>
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <div className="mb-4 flex justify-center">
                    <Package2 className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Welcome to Storesight</CardTitle>
                <CardDescription>Sign in with your Google account to continue</CardDescription>
            </CardHeader>
            <CardContent>
                <LoginForm />
            </CardContent>
        </Card>
      </Suspense>
    </div>
  );
}
