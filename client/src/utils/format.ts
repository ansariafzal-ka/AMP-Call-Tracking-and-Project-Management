/**
 * Format duration seconds as "1h 05m", "12m 40s", or "5s"
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (sec === 0) return '0s';

  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSec = sec % 60;

  if (hours > 0) {
    const formattedMinutes = String(minutes).padStart(2, '0');
    return `${hours}h ${formattedMinutes}m`;
  }

  if (minutes > 0) {
    const formattedSeconds = String(remainingSec).padStart(2, '0');
    return `${minutes}m ${formattedSeconds}s`;
  }

  return `${remainingSec}s`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format date & time as "23 Oct 2026, 04:08 PM"
 */
export function formatDateTime(rawDate: string | Date | null | undefined): string {
  if (!rawDate) return '—';

  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (!trimmed) return '—';

    // Direct match for "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm" without timezone shift
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const year = match[1];
      const monthIdx = parseInt(match[2], 10) - 1;
      const day = match[3];
      let hours = parseInt(match[4], 10);
      const minutes = match[5];
      const month = MONTHS[monthIdx] || match[2];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHours = String(hours).padStart(2, '0');
      return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
    }
  }

  const date = new Date(rawDate);
  if (isNaN(date.getTime())) return '—';

  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = String(hours).padStart(2, '0');

  return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
}

/**
 * Convert server date string or Date into "YYYY-MM-DDTHH:mm" for <input type="datetime-local" />
 */
export function toDateTimeLocalValue(rawDate: string | null | undefined): string {
  if (!rawDate) return '';

  const trimmed = rawDate.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (match && !trimmed.endsWith('Z')) {
    return `${match[1]}T${match[2]}`;
  }

  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Convert <input type="datetime-local" /> value ("YYYY-MM-DDTHH:mm") into server format ("YYYY-MM-DD HH:mm:ss")
 */
export function toServerDateTime(localValue: string): string {
  const trimmed = localValue.trim();
  if (!trimmed) return '';
  const replaced = trimmed.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(replaced)) {
    return `${replaced}:00`;
  }
  return replaced.slice(0, 19);
}

/**
 * Extract readable error message from Axios error
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: { data?: { message?: string; error?: string } } }).response;
    if (resp?.data?.message) return resp.data.message;
    if (resp?.data?.error) return resp.data.error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
