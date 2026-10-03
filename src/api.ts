import type { TrackerData, Habit, QuickNote, RoutineItem } from './types';
import { normalizeRoutineItem } from './types';

export interface BackendStatus {
  configured: boolean;
  scriptUrl: string;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  habitsCount: number;
  entriesCount: number;
  notesCount: number;
  routineCount: number;
}

const API_BASE = '/api';
export const LOCAL_SHEET_KEY = 'habit_tracker_google_script_url';

/**
 * Retrieve the user's saved sheet URL from localStorage
 */
export function getSavedSheetUrl(): string {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem(LOCAL_SHEET_KEY) || '').trim();
  }
  return '';
}

/**
 * Save user's sheet URL in localStorage so they never have to re-enter it
 */
export function saveLocalSheetUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem(LOCAL_SHEET_KEY, url.trim());
    } else {
      localStorage.removeItem(LOCAL_SHEET_KEY);
    }
  }
}

/**
 * Delete sheet URL from localStorage
 */
export function clearLocalSheetUrl(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOCAL_SHEET_KEY);
  }
}

/**
 * Return currently active Google Script URL (LocalStorage first, then fallback to .env)
 */
export function getActiveScriptUrl(): string {
  const saved = getSavedSheetUrl();
  if (saved) return saved;
  return (import.meta.env.VITE_GOOGLE_SCRIPT_URL || '').trim();
}

/**
 * Create headers including dynamic x-sheet-url for backend & serverless
 */
function getHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const activeUrl = getActiveScriptUrl();
  const headers: Record<string, string> = {
    ...extra
  };
  if (activeUrl) {
    headers['x-sheet-url'] = activeUrl;
  }
  return headers;
}

/**
 * Check backend connection and Google Sheets sync status
 */
export async function getBackendStatus(): Promise<BackendStatus> {
  const activeUrl = getActiveScriptUrl();
  try {
    const res = await fetch(`${API_BASE}/status`, {
      headers: getHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.configured && activeUrl) {
        data.configured = true;
        data.scriptUrl = `${activeUrl.slice(0, 35)}...`;
      }
      return data;
    }
  } catch {
    // If backend endpoint is unavailable, check direct URL
  }

  return {
    configured: Boolean(activeUrl),
    scriptUrl: activeUrl ? `${activeUrl.slice(0, 35)}...` : '',
    isSyncing: false,
    lastSyncedAt: null,
    lastSyncError: null,
    habitsCount: 0,
    entriesCount: 0,
    notesCount: 0,
    routineCount: 0
  };
}

/**
 * Configure Google Apps Script Web App URL (saves to localStorage and backend)
 */
export async function saveGoogleScriptUrl(scriptUrl: string): Promise<boolean> {
  const trimmed = (scriptUrl || '').trim();
  saveLocalSheetUrl(trimmed);
  try {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ scriptUrl: trimmed })
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to configure Google Script URL on backend:', err);
    return true; // Local storage save succeeded regardless
  }
}

/**
 * Disconnect & clear Google Apps Script Web App URL from both localStorage and backend
 */
export async function clearGoogleScriptUrl(): Promise<boolean> {
  clearLocalSheetUrl();
  try {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to clear Google Script URL on backend:', err);
    return true;
  }
}

/**
 * Load complete dataset (habits, entries, notes, routine)
 */
export async function fetchAllData(fresh: boolean = false): Promise<{
  data: TrackerData;
  notes: QuickNote[];
  routine: RoutineItem[];
}> {
  const activeUrl = getActiveScriptUrl();

  // 1. Try serverless / backend endpoint first
  try {
    const res = await fetch(`${API_BASE}/data${fresh ? '?fresh=true' : ''}`, {
      headers: getHeaders()
    });
    if (res.ok) {
      const json = await res.json();
      return {
        data: {
          habits: json.habits || [],
          entries: json.entries || [],
          version: json.version || 1
        },
        notes: json.notes || [],
        routine: Array.isArray(json.routine) ? json.routine.map(normalizeRoutineItem) : []
      };
    }
  } catch (err) {
    console.warn('Backend /api/data call failed, checking direct Google Sheets URL...', err);
  }

  // 2. Direct fallback to Google Apps Script Web App
  if (activeUrl) {
    try {
      const res = await fetch(activeUrl, { redirect: 'follow' });
      if (res.ok) {
        const json = await res.json();
        return {
          data: {
            habits: json.habits || [],
            entries: json.entries || [],
            version: json.version || 1
          },
          notes: json.notes || [],
          routine: Array.isArray(json.routine) ? json.routine.map(normalizeRoutineItem) : []
        };
      }
    } catch (directErr) {
      console.error('Direct Google Sheets fetch error:', directErr);
    }
  }

  throw new Error('Unable to connect to Google Sheets backend');
}

/**
 * Save full tracker data in real-time
 */
export async function syncFullData(
  data: TrackerData,
  notes?: QuickNote[],
  routine?: RoutineItem[]
): Promise<void> {
  const activeUrl = getActiveScriptUrl();
  const payload = {
    habits: data.habits,
    entries: data.entries,
    ...(notes ? { notes } : {}),
    ...(routine ? { routine } : {})
  };

  try {
    const res = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    if (res.ok) return;
  } catch {
    // If backend route fails, try direct fallback
  }

  if (activeUrl) {
    try {
      await fetch(activeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });
    } catch (err) {
      console.error('Direct Google Sheets sync error:', err);
    }
  }
}

/**
 * Real-time toggle single entry
 */
export async function syncEntryToggle(habitId: string, date: string, completed?: boolean): Promise<void> {
  try {
    await fetch(`${API_BASE}/entry/toggle`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ habitId, date, completed })
    });
  } catch {
    // Falls back seamlessly
  }
}

/**
 * Real-time habits save
 */
export async function syncHabits(habits: Habit[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/habits`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ habits })
    });
  } catch {
    // Falls back seamlessly
  }
}

/**
 * Real-time delete habit from backend and Google Sheets
 */
export async function deleteHabitFromBackend(
  habitId: string,
  currentData?: TrackerData
): Promise<boolean> {
  const activeUrl = getActiveScriptUrl();
  let success = false;

  // 1. Call backend DELETE endpoint
  try {
    const res = await fetch(`${API_BASE}/habits/${encodeURIComponent(habitId)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (res.ok) success = true;
  } catch {
    // Fall back to direct sync
  }

  // 2. Direct Google Apps Script fallback if backend didn't respond
  if (!success && activeUrl && currentData) {
    try {
      const payload = {
        habits: currentData.habits.filter(h => h.id !== habitId),
        entries: currentData.entries.filter(e => e.habitId !== habitId)
      };
      await fetch(activeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });
      success = true;
    } catch (err) {
      console.error('Direct Google Sheets delete error:', err);
    }
  }

  return success;
}

/**
 * Real-time notes save
 */
export async function syncNotes(notes: QuickNote[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ notes })
    });
  } catch {
    // Falls back seamlessly
  }
}

/**
 * Real-time routine save
 */
export async function syncRoutine(routine: RoutineItem[]): Promise<void> {
  const activeUrl = getActiveScriptUrl();
  const normalized = routine.map(normalizeRoutineItem);
  try {
    const res = await fetch(`${API_BASE}/routine`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ routine: normalized })
    });
    if (res.ok) return;
  } catch {
    // Falls back seamlessly
  }

  if (activeUrl) {
    try {
      await fetch(activeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routine: normalized }),
        mode: 'no-cors'
      });
    } catch (err) {
      console.error('Direct Google Sheets routine sync error:', err);
    }
  }
}
