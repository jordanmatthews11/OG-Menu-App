/**
 * Shared retailer-name matching used by List Genie and the Retailer/Channel Mix Lists tab.
 *
 * Retailer names come from two vocabularies that don't agree: the Boosters table
 * ("Costco Wholesale", "Target") and the Store Lists table ("Costco Wholesale Corp",
 * "Target (full chain)"). These helpers bridge trivial differences WITHOUT collapsing
 * genuinely different variants — "Walmart (Full Chain)" must never match
 * "Walmart Supercenters", and regional splits (ON/QC, WEST/EAST) must stay distinct.
 */

const retailerSynonyms: Record<string, string> = {
    "cvs": "cvs pharmacy",
    "costco wholesale": "costco",
    "heb": "h-e-b",
    "bj's": "bj's wholesale club",
    "ahold (all banners)": "ahold",
};

/** Lowercase, trim, drop a trailing "(all banners)", then apply the synonym map. */
export const normalizeRetailerName = (name: string): string => {
    let lowerName = (name || '').toLowerCase().trim();
    lowerName = lowerName.replace(/\s*\(all banners\)\s*$/i, '').trim();

    for (const key in retailerSynonyms) {
        if (lowerName === key || lowerName === retailerSynonyms[key]) {
            return retailerSynonyms[key];
        }
    }
    return lowerName;
};

/**
 * Exact-match key for holding-company detection on a USER PICK: trim + lowercase only.
 * "(All Banners)" is intentionally preserved, so only a pick named exactly like the holding
 * company (e.g. "Albertsons (All Banners)") expands into banners; a plain "Albertsons" does not.
 */
export const normalizeForHoldingMatch = (name: string): string =>
    (name || '').trim().toLowerCase();

// Pure corporate noise — dropped entirely before comparing.
const CORE_NOISE = new Set([
    "the", "corp", "corporation", "inc", "incorporated", "co", "company", "llc", "ltd", "group", "holdings",
]);
// Generic descriptors/qualifiers that may appear on one side only.
const DESCRIPTORS = new Set([
    "pharmacy", "wholesale", "market", "markets", "supermarket", "supermarkets",
    "store", "stores", "club", "outlet", "outlets",
    "supercenter", "supercenters", "supercentre", "supercentres", "only",
    "full", "chain", "all", "banners", "banner",
]);

const _tokenCache = new Map<string, Set<string>>();
const retailerTokenSet = (name: string): Set<string> => {
    let s = _tokenCache.get(name);
    if (!s) {
        s = new Set(
            (name || '').toLowerCase()
                .replace(/[^a-z0-9]+/g, " ") // punctuation/parens/hyphens -> spaces ("h-e-b" -> "heb")
                .split(/\s+/)
                .filter(Boolean)
                .filter(t => !CORE_NOISE.has(t))
        );
        _tokenCache.set(name, s);
    }
    return s;
};

/**
 * Token-set match (deliberately no edit-distance, which would wrongly merge WEST/EAST):
 * equal sets match, or one is a subset of the other and every extra token is a generic
 * descriptor or a bare number. Two names each carrying a DIFFERENT qualifier are never in a
 * subset relation, so they never match.
 */
export const fuzzyRetailerMatch = (a: string, b: string): boolean => {
    const A = retailerTokenSet(a);
    const B = retailerTokenSet(b);
    if (A.size === 0 || B.size === 0) return false;

    const [small, large] = A.size <= B.size ? [A, B] : [B, A];
    for (const t of small) if (!large.has(t)) return false;
    for (const t of large) if (!small.has(t) && !DESCRIPTORS.has(t) && !/^\d+$/.test(t)) return false;
    return true;
};

/** Exact-normalized match first, then the qualifier-aware fuzzy match. */
export const retailerNamesMatch = (a: string, b: string): boolean =>
    normalizeRetailerName(a) === normalizeRetailerName(b) || fuzzyRetailerMatch(a, b);

/** Case/whitespace-insensitive country comparison. */
export const sameCountry = (a?: string, b?: string): boolean =>
    (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
