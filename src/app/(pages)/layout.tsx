'use client';

import Link from 'next/link';
import { AuthGuard } from '@/components/auth/auth-guard';
import { UserNav } from '@/components/auth/user-nav';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/categories', label: 'Categories' },
  { href: '/standard-lists', label: 'Retailer/Channel Mix Lists' },
  { href: '/code-directory', label: 'Master Code Directory' },
];

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AuthGuard>
      <div className="flex min-h-screen w-full flex-col bg-muted/30">
        {/* Purple header bar */}
        <header className="flex h-14 lg:h-[60px] items-center justify-between bg-[#4A2D8A] px-4 lg:px-6 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/categories" className="flex items-center gap-2">
              <Image
                src="/images/storesight-white.png"
                alt="Storesight"
                width={144}
                height={32}
                className="h-8 w-auto"
                priority
              />
              <span className="text-white font-semibold text-lg hidden sm:inline">Storesight Menu</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <UserNav variant="header" />
          </div>
        </header>

        {/* Tab navigation */}
        <div className="bg-card border-b px-4 lg:px-6 shrink-0">
          <nav className="flex gap-1" aria-label="Main navigation">
            {TABS.map((tab) => {
              const isActive = pathname === tab.href || (tab.href !== '/categories' && pathname.startsWith(tab.href));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
