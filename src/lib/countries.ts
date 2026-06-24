/**
 * Helpers for the category `country` field, which must hold a single country per row.
 *
 * Users have historically entered combined values like "US | CA" or "US, CA" into one
 * row, which breaks the catalog (it groups rows by name and aggregates each row's single
 * `country` into a list). These helpers split/validate so we can keep one row per country.
 */

// Delimiters that indicate multiple countries packed into one value.
const COUNTRY_SPLIT_REGEX = /\s*(?:\||,|\/|&|\band\b)\s*/i;

/**
 * Split a possibly-combined country value into clean, de-duplicated country tokens.
 * "US | CA" -> ["US", "CA"]; "US, CA" -> ["US", "CA"]; "US" -> ["US"]; "" / null -> [].
 * De-duplication is case-insensitive; the first-seen casing is preserved.
 */
export function splitCountries(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of String(value).split(COUNTRY_SPLIT_REGEX)) {
    const token = part.trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}

/**
 * True only for a single clean country token: non-empty, no surrounding/internal
 * whitespace, and no multi-country delimiter. Used to validate manually-added
 * countries in the picker and to detect already-clean rows during cleanup.
 */
export function isCleanCountryToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const token = value.trim();
  if (!token || /\s/.test(token)) return false;
  return splitCountries(token).length === 1;
}
