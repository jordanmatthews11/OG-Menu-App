import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

/** Where the Menu now lives. */
const BLOOM_URL = 'https://menu.storesight.org/categories';
const BLOOM_LABEL = 'menu.storesight.org';

/**
 * Full-screen notice that the Storesight Menu has moved to Bloom.
 *
 * Rendered from the root layout so it covers every page, and it is intentionally opaque and
 * on top of everything (z-index above the sticky app header) — the app underneath is no longer
 * meant to be used. Remove the <MovedNotice /> element in `src/app/layout.tsx` to restore access.
 */
export function MovedNotice() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="moved-notice-title"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-auto bg-[#4A2D8A] px-6 py-12 text-center"
    >
      <Image
        src="/images/storesight-white.png"
        alt="Storesight"
        width={216}
        height={48}
        className="mb-10 h-10 w-auto sm:h-12"
        priority
      />

      <h1
        id="moved-notice-title"
        className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl"
      >
        The Storesight Menu has moved to Bloom
      </h1>

      <a
        href={BLOOM_URL}
        className="mt-10 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-[#4A2D8A] shadow-lg transition-colors hover:bg-white/90 sm:text-lg"
      >
        {BLOOM_LABEL}
        <ArrowRight className="h-5 w-5" />
      </a>

      <p className="mt-6 text-sm text-white/70">
        Please update your bookmarks to{' '}
        <a href={BLOOM_URL} className="font-medium text-white underline underline-offset-2">
          {BLOOM_LABEL}
        </a>
        .
      </p>
    </div>
  );
}
