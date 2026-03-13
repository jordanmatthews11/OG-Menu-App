"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const RETAILER_TABS = [
  {
    href: "/standard-lists",
    label: "See Available Retailer/Channel Mix Lists",
  },
  {
    href: "/list-genie",
    label: "List Genie",
  },
];

export function RetailerTabs() {
  const pathname = usePathname();

  return (
    <div className="mt-4 mb-6">
      <nav
        className="inline-flex rounded-md border bg-card p-1 shadow-sm"
        aria-label="Retailer navigation"
      >
        {RETAILER_TABS.map((tab) => {
          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-2 text-sm font-semibold rounded-md transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

