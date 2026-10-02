/**
 * Beginner Beacon availability policy, approved 2 October 2026.
 * An overnight observation is not live checkout. Only a verified zero is
 * exposed as Fully booked; positive counts never reach AI knowledge.
 */
export const BEGINNER_SNAPSHOT_TTL_MS = 36 * 60 * 60 * 1000;

/** Parse a source count without converting blanks, booleans or errors to zero. */
export function parseObservedPlaces(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const count = Number(value.trim());
  return Number.isSafeInteger(count) ? count : null;
}

function parseInstant(value, field) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new TypeError(`${field} must be an ISO timestamp with an explicit offset`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${field} is invalid`);
  return milliseconds;
}

/**
 * Construct the ONLY availability fields permitted in the Agent's schedule.
 * Keep raw source counts in non-AI diagnostics only. Do not spread a source
 * row into customer-facing output: that could reintroduce a positive count.
 * @param {unknown} value Source Places Available field, not Max Places.
 * @param {{checkedAt: string, now?: string}} timestamps
 */
export function beginnerAvailability(value, { checkedAt, now = new Date().toISOString() }) {
  const checked = parseInstant(checkedAt, 'checkedAt');
  const current = parseInstant(now, 'now');
  if (checked > current) throw new RangeError('Snapshot successful-check time is in the future');
  const expires = checked + BEGINNER_SNAPSHOT_TTL_MS;
  const fresh = current < expires;
  const count = parseObservedPlaces(value);
  const status = !fresh ? 'stale' : count === 0 ? 'fully_booked' :
    count === null ? 'unknown' : 'check_availability';
  return {
    status,
    label: status === 'fully_booked' ? 'Fully booked' : 'Check availability',
    checkedAt: new Date(checked).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    fresh,
    explanation: status === 'fully_booked'
      ? 'Fully booked at the last successful check. Do not offer this date as available. The live booking page or dive team can confirm any reopening.'
      : status === 'stale'
      ? 'This snapshot has expired. Check the live booking page or dive team; do not quote its previous availability status as current.'
      : status === 'unknown'
      ? 'Availability was not confirmed in the source. Check the live booking page or dive team.'
      : 'Check availability on the live booking page. No current number of places is confirmed and no place is held.'
  };
}
