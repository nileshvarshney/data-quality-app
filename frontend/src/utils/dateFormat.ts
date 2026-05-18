export function formatTs(
  iso: string | null | undefined,
  timezone: string,
  opts?: { dateOnly?: boolean; withSeconds?: boolean; yearAlways?: boolean }
): string {
  if (!iso) return '—'
  const d = new Date(iso)
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
