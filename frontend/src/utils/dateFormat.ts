export function formatTs(
  iso: string | null | undefined,
  timezone: string,
  opts?: { dateOnly?: boolean; withSeconds?: boolean; yearAlways?: boolean }
): string {
  if (!iso) return '—'
  // The backend stores naive UTC datetimes and serialises them via Python's
  // .isoformat() which produces no timezone suffix (e.g. "2024-05-15T17:30:00").
  // JavaScript's Date constructor treats timezone-free ISO strings as *local*
  // time, not UTC, which breaks the configured-timezone conversion.
  // Appending 'Z' forces UTC interpretation for any string that lacks an
  // explicit offset (+HH:MM) or the Z suffix.
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return '—'

  if (opts?.dateOnly) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(opts?.withSeconds ? { second: '2-digit' } : {}),
    ...(opts?.yearAlways ? { year: 'numeric' } : {}),
  }).format(d)
}

/** Format a live Date object (e.g. page refresh time) in the configured timezone. */
export function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function tzAbbr(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value ?? timezone
  } catch {
    return timezone
  }
}
