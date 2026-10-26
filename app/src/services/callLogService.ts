import { Platform } from 'react-native';

export interface FormattedCallRecord {
  id?: string;
  phoneNumber: string;
  duration: number;
  dateTimeFormatted: string;
  callTypeLabel: string;
  rawType?: string | number;
  timestamp?: string | number;
}

// Format date into exact "DD MMM YYYY, hh:mm A" format
export function formatDateTime(rawTimestamp: number | string | undefined): string {
  if (!rawTimestamp) return 'N/A';
  const num = Number(rawTimestamp);
  const date = new Date(isNaN(num) ? String(rawTimestamp) : num);
  if (isNaN(date.getTime())) return String(rawTimestamp);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 hour should be 12
  const formattedHours = String(hours).padStart(2, '0');

  return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
}

// Map call type to required labels
export function mapCallType(rawType: string | number | undefined, duration: number): string {
  const t = String(rawType || '').toUpperCase();
  const dur = Number(duration || 0);

  const isOutgoing = t === 'OUTGOING' || t === '2' || t === 'WIFI_OUTGOING';
  const isIncoming = t === 'INCOMING' || t === '1' || t === 'WIFI_INCOMING';
  const isMissed = t === 'MISSED' || t === '3';
  const isRejected = t === 'REJECTED' || t === '5';
  const isBlocked = t === 'BLOCKED' || t === '6';

  if (isOutgoing) {
    if (dur === 0) {
      return 'Outgoing (not answered)';
    }
    return 'Outgoing';
  }

  if (isIncoming) return 'Incoming';
  if (isMissed) return 'Missed';
  if (isRejected) return 'Rejected';
  if (isBlocked) return 'Blocked';

  return 'Other';
}

function formatEntry(entry: any): FormattedCallRecord {
  const duration = Number(entry.duration || 0);
  const rawType = entry.type || entry.rawType;
  const timestamp = entry.timestamp || entry.dateTime || entry.date;

  return {
    id: String(entry.id || Math.random()),
    phoneNumber: entry.phoneNumber || entry.number || 'Unknown',
    duration,
    dateTimeFormatted: formatDateTime(timestamp),
    callTypeLabel: mapCallType(rawType, duration),
    rawType,
    timestamp,
  };
}

/**
 * Safe loader for react-native-call-log
 */
function getCallLogsLibrary(): any {
  try {
    const lib = require('react-native-call-log');
    return lib.default || lib;
  } catch (err) {
    return null;
  }
}

/**
 * Safe loader for local Kotlin Expo module fallback
 */
function getLocalCallLogModule(): any {
  try {
    const mod = require('../../modules/call-log');
    return mod.default || mod;
  } catch {
    return null;
  }
}

/**
 * Fetch raw call log entries from react-native-call-log or local module
 */
export async function loadRawCallLogs(limit: number = 20): Promise<any[]> {
  if (Platform.OS !== 'android') {
    return [];
  }

  // 1. Try react-native-call-log
  const CallLogs = getCallLogsLibrary();
  if (CallLogs && typeof CallLogs.load === 'function') {
    try {
      const entries = await CallLogs.load(limit);
      if (Array.isArray(entries)) {
        return entries;
      }
    } catch (err) {
      console.warn('react-native-call-log load error, falling back to local module:', err);
    }
  }

  // 2. Fallback to local Kotlin module
  const localMod = getLocalCallLogModule();
  if (localMod && typeof localMod.load === 'function') {
    try {
      const entries = await localMod.load(limit);
      if (Array.isArray(entries)) {
        return entries;
      }
    } catch (err) {
      console.warn('local CallLog module error:', err);
      throw err;
    }
  }

  throw new Error('Call log native module unavailable.');
}

/**
 * Read call log entries with specified limit (formatted)
 */
export async function getCallLogs(limit: number): Promise<FormattedCallRecord[]> {
  const rawEntries = await loadRawCallLogs(limit);
  return rawEntries.map(formatEntry);
}

export interface MatchedOutgoingCall {
  contact_number: string;
  duration_seconds: number;
  status: 'answered' | 'not_answered';
  called_at: string;
}

/**
 * Find the most recent outgoing call matching the target number
 * initiated since startedAtMs (with 5 seconds clock drift buffer).
 */
export async function findMatchingRecentOutgoingCall(
  targetNumber: string,
  startedAtMs: number
): Promise<MatchedOutgoingCall | null> {
  try {
    const rawEntries = await loadRawCallLogs(25);
    const targetDigits = String(targetNumber || '').replace(/\D/g, '');
    if (!targetDigits) return null;

    const cutoffMs = startedAtMs - 5000; // 5 second buffer for clock drift

    for (const entry of rawEntries) {
      // Check if outgoing
      const rawType = String(entry.type || entry.rawType || '').toUpperCase();
      const isOutgoing = rawType === 'OUTGOING' || rawType === '2' || rawType === 'WIFI_OUTGOING';
      if (!isOutgoing) continue;

      // Parse timestamp
      let tsNum = Number(entry.timestamp || entry.dateTime || entry.date);
      let entryMs = 0;
      if (!isNaN(tsNum) && tsNum > 0) {
        if (tsNum < 10000000000) {
          tsNum = tsNum * 1000;
        }
        entryMs = tsNum;
      } else {
        const parsed = new Date(entry.timestamp || entry.dateTime || entry.date).getTime();
        if (!isNaN(parsed)) entryMs = parsed;
      }

      // If call happened before cutoff, skip
      if (entryMs > 0 && entryMs < cutoffMs) {
        continue;
      }

      // Check phone number match on last 10 digits
      const entryDigits = String(entry.phoneNumber || entry.number || '').replace(/\D/g, '');
      if (!entryDigits) continue;

      let isMatch = false;
      if (entryDigits.length >= 10 && targetDigits.length >= 10) {
        isMatch = entryDigits.slice(-10) === targetDigits.slice(-10);
      } else {
        isMatch = entryDigits === targetDigits;
      }

      if (isMatch) {
        const durationSec = Math.max(0, Math.floor(Number(entry.duration || 0)));
        const status: 'answered' | 'not_answered' = durationSec > 0 ? 'answered' : 'not_answered';
        const callDate = entryMs > 0 ? new Date(entryMs) : new Date(startedAtMs);
        const pad = (n: number) => String(n).padStart(2, '0');
        const calledAtLocal = `${callDate.getFullYear()}-${pad(callDate.getMonth() + 1)}-${pad(callDate.getDate())} ${pad(callDate.getHours())}:${pad(callDate.getMinutes())}:${pad(callDate.getSeconds())}`;

        return {
          contact_number: targetNumber,
          duration_seconds: durationSec,
          status,
          called_at: calledAtLocal,
        };
      }
    }

    return null;
  } catch (err) {
    console.warn('Error finding matching outgoing call:', err);
    return null;
  }
}

