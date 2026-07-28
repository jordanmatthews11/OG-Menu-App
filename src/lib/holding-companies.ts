/**
 * Holding-company breakout.
 *
 * A store list often carries a PARENT retailer with a single commitment
 * (e.g. "Ahold Delhaize  40"), while users think and pick in terms of individual banners
 * (Food Lion, Stop & Shop, ...). Each holding company stores a percentage per banner, so any
 * parent commitment can be decomposed into per-banner store counts — no matter which store
 * list we're looking at.
 *
 * Allocation preserves the parent total exactly (largest-remainder), so decomposing a row
 * never changes a list's total.
 */

import type { Booster, HoldingCompany, StoreList } from '@/lib/types';
import { retailerNamesMatch, normalizeRetailerName, sameCountry } from '@/lib/retailer-match';

export type BannerAllocation = {
    boosterId: string;
    name: string;
    percentage: number;
    monthlyQuota: number;
};

export type BreakoutRow = {
    row: StoreList;
    /** Banner decomposition of `row`. Empty when the row is not a holding-company parent. */
    children: BannerAllocation[];
};

/**
 * Split `total` across `percentages` using the largest-remainder method, so the parts sum to
 * exactly `total`. Percentages are normalized by their own sum, which keeps this correct even
 * when they don't add to 100 (legacy records, even-split fallback).
 */
export function allocateByPercentage(total: number, percentages: number[]): number[] {
    const n = percentages.length;
    if (n === 0) return [];
    const sum = percentages.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total) || total <= 0 || sum <= 0) return percentages.map(() => 0);

    const raw = percentages.map(p => (p / sum) * total);
    const result = raw.map(r => Math.floor(r));
    let remainder = Math.round(total) - result.reduce((a, b) => a + b, 0);

    const byFrac = raw
        .map((r, i) => ({ i, frac: r - Math.floor(r) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);

    for (let k = 0; remainder > 0 && k < byFrac.length; k++, remainder--) {
        result[byFrac[k].i]++;
    }
    return result;
}

/** Integer percentages for `n` banners that sum to exactly 100 (e.g. 3 -> [34, 33, 33]). */
export function evenSplitPercentages(n: number): number[] {
    if (n <= 0) return [];
    const base = Math.floor(100 / n);
    const rem = 100 - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Percentage per banner id for a holding company. Falls back to an even split for banners with
 * no configured percentage, so holding companies saved before percentages existed still break out.
 */
export function getBannerPercentages(hc: HoldingCompany): Record<string, number> {
    const ids = hc.bannerIds || [];
    const stored = hc.bannerPercentages || {};
    const hasAny = ids.some(id => typeof stored[id] === 'number' && stored[id] > 0);
    if (hasAny) {
        return ids.reduce<Record<string, number>>((acc, id) => {
            acc[id] = typeof stored[id] === 'number' ? stored[id] : 0;
            return acc;
        }, {});
    }
    const even = evenSplitPercentages(ids.length);
    return ids.reduce<Record<string, number>>((acc, id, i) => {
        acc[id] = even[i];
        return acc;
    }, {});
}

/** The holding company whose name matches this store-list retailer, if any. */
export function findHoldingCompanyForRetailer(
    retailer: string,
    country: string,
    holdingCompanies: HoldingCompany[] | null | undefined
): HoldingCompany | null {
    if (!retailer || !holdingCompanies?.length) return null;
    const inCountry = holdingCompanies.filter(hc => sameCountry(hc.country, country));
    if (inCountry.length === 0) return null;

    // Prefer an exact normalized match before falling back to the fuzzy matcher.
    const target = normalizeRetailerName(retailer);
    return (
        inCountry.find(hc => normalizeRetailerName(hc.name) === target) ??
        inCountry.find(hc => retailerNamesMatch(hc.name, retailer)) ??
        null
    );
}

/** Banner allocations for one parent commitment. Empty if not a parent or nothing resolves. */
export function getBannerAllocations(
    row: StoreList,
    holdingCompanies: HoldingCompany[] | null | undefined,
    boosters: Booster[] | null | undefined
): BannerAllocation[] {
    const hc = findHoldingCompanyForRetailer(row.retailer, row.country, holdingCompanies);
    if (!hc) return [];

    const pct = getBannerPercentages(hc);
    const resolved = (hc.bannerIds || [])
        .map(id => {
            const booster = (boosters || []).find(b => b.id === id);
            return booster ? { boosterId: id, name: booster.name, percentage: pct[id] ?? 0 } : null;
        })
        .filter((b): b is { boosterId: string; name: string; percentage: number } => b !== null);

    if (resolved.length === 0) return [];

    const counts = allocateByPercentage(row.monthlyQuota || 0, resolved.map(r => r.percentage));
    return resolved.map((r, i) => ({ ...r, monthlyQuota: counts[i] }));
}

/** Decorate store-list rows with their banner decomposition (children are empty for normal rows). */
export function buildBreakout(
    rows: StoreList[],
    holdingCompanies: HoldingCompany[] | null | undefined,
    boosters: Booster[] | null | undefined
): BreakoutRow[] {
    return rows.map(row => ({ row, children: getBannerAllocations(row, holdingCompanies, boosters) }));
}

/** Every retailer name a list effectively covers: each row plus any banner decomposition. */
export function expandedRetailerNames(breakout: BreakoutRow[]): string[] {
    const names: string[] = [];
    for (const { row, children } of breakout) {
        names.push(row.retailer);
        for (const c of children) names.push(c.name);
    }
    return names;
}
