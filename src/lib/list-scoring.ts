/**
 * Scoring a standard store list against the customer's requested retailer list.
 *
 * Two independent scores, because they answer different questions:
 *
 *  - Retailer match % — "are my retailers in this list?"  Rank-weighted (rank 1 counts most),
 *    which is the long-standing List Genie behaviour and is left unchanged.
 *  - Volume coverage % — "does it carry enough visits?"  Compares each requested monthly target
 *    against what the list actually offers. Only computed when targets were supplied.
 *
 * Both understand holding-company breakout, so a pick of "Food Lion" draws on the allocated
 * share of an "Ahold Delhaize 40" parent row.
 */

import type { BreakoutRow } from '@/lib/holding-companies';
import { retailerNamesMatch } from '@/lib/retailer-match';

export type ScoringPick = {
    name: string;
    /** 1 = most important. Drives the retailer-match weighting. */
    rank: number;
    /** Requested monthly visits, if the customer gave one. */
    monthlyTarget?: number;
};

export type VolumeGap = {
    name: string;
    target: number;
    available: number;
    /** target - available, always > 0. */
    short: number;
};

export type ListScore<T> = {
    /** Rank-weighted presence, 0-100. */
    retailerMatchPct: number;
    /** Σ min(available, target) / Σ target, 0-100. Null when no targets were supplied. */
    volumeCoveragePct: number | null;
    matched: T[];
    unmatched: T[];
    /** Every pick whose target the list can't fully cover, including fully-missing ones. */
    gaps: VolumeGap[];
    /** Monthly visits the list offers, keyed by pick name — used to annotate the UI. */
    availableByName: Map<string, number>;
};

/** True if the list names this retailer, either on a row or as a broken-out banner. */
export function isRetailerPresent(name: string, breakout: BreakoutRow[]): boolean {
    return breakout.some(({ row, children }) =>
        retailerNamesMatch(name, row.retailer) || children.some(c => retailerNamesMatch(name, c.name))
    );
}

/**
 * Monthly visits the list offers for a retailer.
 *
 * Rows are checked first and, if any row matches, banner children are NOT added — otherwise a
 * parent's commitment and its own decomposition would both count for the same pick.
 */
export function availableMonthlyFor(name: string, breakout: BreakoutRow[]): number {
    let fromRows = 0;
    let rowMatched = false;

    for (const { row } of breakout) {
        if (retailerNamesMatch(name, row.retailer)) {
            fromRows += row.monthlyQuota || 0;
            rowMatched = true;
        }
    }
    if (rowMatched) return fromRows;

    let fromChildren = 0;
    for (const { children } of breakout) {
        for (const child of children) {
            if (retailerNamesMatch(name, child.name)) fromChildren += child.monthlyQuota || 0;
        }
    }
    return fromChildren;
}

/**
 * Score one candidate list.
 *
 * Note: if a list of picks contains BOTH a holding-company parent and its own banners, that
 * capacity is counted for each of them. The picker can't produce that state (adding a parent
 * expands into banners and hides the parent) — only a hand-pasted list can.
 */
export function scoreList<T extends ScoringPick>(picks: T[], breakout: BreakoutRow[]): ListScore<T> {
    const total = picks.length;
    const maxWeight = picks.reduce((sum, p) => sum + (total + 1 - p.rank), 0);

    const matched: T[] = [];
    const unmatched: T[] = [];
    const gaps: VolumeGap[] = [];
    const availableByName = new Map<string, number>();

    let weighted = 0;
    let targetTotal = 0;
    let coveredTotal = 0;

    for (const pick of picks) {
        const present = isRetailerPresent(pick.name, breakout);
        const available = present ? availableMonthlyFor(pick.name, breakout) : 0;
        availableByName.set(pick.name, available);

        if (present) {
            matched.push(pick);
            weighted += total + 1 - pick.rank;
        } else {
            unmatched.push(pick);
        }

        const target = pick.monthlyTarget;
        if (typeof target === 'number' && target > 0) {
            targetTotal += target;
            // Surplus is not rewarded: a list offering more than asked caps at the target.
            coveredTotal += Math.min(available, target);
            if (available < target) {
                gaps.push({ name: pick.name, target, available, short: target - available });
            }
        }
    }

    return {
        retailerMatchPct: maxWeight > 0 ? Math.round((weighted / maxWeight) * 100) : 0,
        volumeCoveragePct: targetTotal > 0 ? Math.round((coveredTotal / targetTotal) * 100) : null,
        matched,
        unmatched,
        gaps,
        availableByName,
    };
}

/** Ranking score: volume pulls its weight only when targets were supplied. */
export function overallScore(retailerMatchPct: number, volumeCoveragePct: number | null): number {
    return volumeCoveragePct === null
        ? retailerMatchPct
        : (retailerMatchPct + volumeCoveragePct) / 2;
}
