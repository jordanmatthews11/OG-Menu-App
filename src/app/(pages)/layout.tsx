'use client';

import { AppSidebar } from '@/components/layout/app-sidebar';
import {
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthGuard } from '@/components/auth/auth-guard';
import { UserNav } from '@/components/auth/user-nav';
import Image from 'next/image';
import { ClipboardList } from 'lucide-react';

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarRail />
          <main className="flex flex-1 flex-col bg-muted/30">
              <header className="flex h-14 lg:h-[60px] items-center justify-between border-b bg-card px-6 sticky top-0 z-30">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger className="md:hidden"/>
                    <Link href="/" className="flex items-center gap-2">
                        <Image
                            src="https://fieldagent-app.s3.amazonaws.com/project_files/2025-09/1586029/storesight_primary-1.png"
                            alt="Storesight Logo"
                            width={120}
                            height={24}
                            className="h-auto"
                            priority
                        />
                    </Link>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-muted-foreground" />
                    <h1 className="text-lg font-semibold">Storesight Menu</h1>
                  </div>
                  
                   <div className="flex items-center gap-4">
                    <UserNav />
                    <ThemeToggle />
                  </div>
              </header>
              <div className="flex-1 overflow-auto p-4 md:p-6">
                  {children}
              </div>
          </main>
        </div>
      </SidebarProvider>
    </AuthGuard>
  );
}
