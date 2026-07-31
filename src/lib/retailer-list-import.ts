/**
 * Bulk import of a customer's retailer list into List Genie.
 *
 * Customers arrive with a list already written down — either pasted text like
 *   "Ahold Delhaize (40), Albertsons (all banners) (60), Costco Wholesale Corp (20), ..."
 * or a spreadsheet. Both reduce to the same shape: a retailer name plus an optional monthly
 * visit target (same unit as a store list's `monthlyQuota`, so the numbers compare directly).
 *
 * Parsing is deliberately pure and side-effect free so it can be unit tested, and the UI shows
 * a preview of the result before anything is added to the user's list.
 */

import { normalizeRetailerName } from '@/lib/retailer-match';

export type ParsedEntry = {
    name: string;
    /** Requested monthly visits. Undefined when the source listed a name with no number. */
    monthlyTarget?: number;
};

export type ParseResult = {
    entries: ParsedEntry[];
    /** Names dropped because an earlier entry already covered the same retailer. */
    duplicates: string[];
};

/**
 * Pull a trailing count off one entry.
 *
 * Only a count at the very END is taken, which is what keeps names that contain their own
 * parentheses intact: "Albertsons (all banners) (60)" -> name "Albertsons (all banners)", 60.
 */
const splitTrailingCount = (raw: string): ParsedEntry => {
    // Matched against the raw text (tabs intact), so a tab-separated column still reads as a
    // separator. Whitespace is only collapsed inside the extracted name.
    const text = raw.trim();
    const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

    const patterns = [
        /^([\s\S]*?)\s*\(\s*([\d,]+(?:\.\d+)?)\s*\)$/,          // "Name (60)"
        /^([\s\S]*?)\s*[-–—:]\s*([\d,]+(?:\.\d+)?)$/,           // "Name - 60" / "Name: 60"
        /^([\s\S]*?)(?:\t+|[ ]{2,})([\d,]+(?:\.\d+)?)$/,        // "Name<TAB>60" / "Name   60"
    ];

    for (const re of patterns) {
        const m = text.match(re);
        if (!m) continue;
        const name = tidy(m[1]);
        const value = Number(m[2].replace(/,/g, ''));
        if (name && Number.isFinite(value) && value > 0) {
            return { name, monthlyTarget: Math.round(value) };
        }
    }

    return { name: tidy(text) };
};

/** Drop repeats of the same retailer, keeping the first occurrence. */
const dedupe = (list: ParsedEntry[]): ParseResult => {
    const seen = new Set<string>();
    const entries: ParsedEntry[] = [];
    const duplicates: string[] = [];

    for (const entry of list) {
        const name = entry.name?.trim();
        if (!name) continue;
        const key = normalizeRetailerName(name);
        if (!key) continue;
        if (seen.has(key)) {
            duplicates.push(name);
            continue;
        }
        seen.add(key);
        entries.push(entry);
    }

    return { entries, duplicates };
};

/** An entry that carries its own count ends with "(60)", "- 60", ": 60", a tab, or "  60". */
const COUNT_TAIL = /(?:\(\s*[\d,]+(?:\.\d+)?\s*\)|[-–—:]\s*[\d,]+(?:\.\d+)?|(?:\t+|[ ]{2,})[\d,]+(?:\.\d+)?)\s*$/;

/**
 * Decide whether the line breaks inside one comma-chunk are entry separators or soft wraps.
 *
 * Pasted text is often hard-wrapped at some width, so a break can land anywhere — including
 * mid-name ("Publix Super\nMarkets (24)") or just before a count ("Costco Wholesale Corp\n(20)").
 * Lines are separate entries only when they are uniform: every line carries its own count (a
 * per-line list with numbers) or no line does (a plain list of names). A mix means the break
 * split a single entry, so the lines are rejoined.
 */
const splitChunkLines = (chunk: string): string[] => {
    const lines = chunk.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length <= 1) return lines;

    const withCount = lines.filter(line => COUNT_TAIL.test(line)).length;
    if (withCount === lines.length || withCount === 0) return lines;
    return [lines.join(' ')];
};

/**
 * Parse pasted text. Handles a comma-separated blob, one-per-line lists, tab-separated columns,
 * and hard-wrapped entries.
 */
export function parseRetailerListText(text: string): ParseResult {
    if (!text || !text.trim()) return { entries: [], duplicates: [] };

    const rawEntries: string[] = [];
    for (const chunk of text.split(/[,;]+/)) {
        if (!chunk.trim()) continue;
        rawEntries.push(...splitChunkLines(chunk));
    }

    return dedupe(rawEntries.map(splitTrailingCount));
}

// Words that suggest a header cell rather than a retailer.
const HEADER_WORDS = /retailer|store|name|monthly|count|quota|visit|banner|chain/i;

const isNumericCell = (value: string): boolean =>
    /^[\d,]+(\.\d+)?$/.test(value) && Number.isFinite(Number(value.replace(/,/g, '')));

/**
 * Parse spreadsheet rows given as arrays of cells (no header required).
 *
 * Per row: the first non-numeric cell is the retailer, the first positive numeric cell is the
 * target — in either column order. A leading header row is skipped when it reads like labels.
 */
export function parseRetailerListRows(rows: unknown[][]): ParseResult {
    const parsed: ParsedEntry[] = [];

    for (const row of rows || []) {
        if (!Array.isArray(row)) continue;

        let name = '';
        let target: number | undefined;

        for (const cell of row) {
            if (cell === null || cell === undefined) continue;
            const value = String(cell).trim();
            if (!value) continue;

            if (isNumericCell(value)) {
                const num = Number(value.replace(/,/g, ''));
                if (target === undefined && num > 0) target = Math.round(num);
            } else if (!name) {
                name = value;
            }
        }

        if (!name) continue;

        // Header row: first row, label-like wording, no number beside it. The digit check keeps a
        // real retailer such as "Store 24" from being mistaken for a header.
        const looksLikeHeader =
            parsed.length === 0 && target === undefined && HEADER_WORDS.test(name) && !/\d/.test(name);
        if (looksLikeHeader) continue;

        parsed.push(target === undefined ? { name } : { name, monthlyTarget: target });
    }

    return dedupe(parsed);
}
