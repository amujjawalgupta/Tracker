// ─── Core Data Types ───────────────────────────────────────────

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  monthlyGoal: number;
  createdAt: string;
  order: number;
}

export interface DayEntry {
  habitId: string;
  date: string; // "YYYY-MM-DD"
  completed: boolean;
}

export interface TrackerData {
  habits: Habit[];
  entries: DayEntry[];
  version: number;
}

export interface WeekGroup {
  weekNumber: number;
  days: DayInfo[];
}

export interface DayInfo {
  date: Date;
  dayOfWeek: string;
  dayNumber: number;
  isToday: boolean;
  dateString: string; // "YYYY-MM-DD"
}

export type Theme = 'light' | 'dark';

// ─── Quick Notes ───────────────────────────────────────────────

export interface QuickNote {
  id: string;
  text: string;
  createdAt: string;
  color: string; // accent color for the note card
}

// ─── Daily Routine ─────────────────────────────────────────────

export interface RoutineItem {
  id: string;
  time: string;      // e.g. "06:00"
  endTime: string;   // e.g. "06:30"
  activity: string;
  emoji: string;
  days: number[];    // [0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat]
}

export function normalizeTimeString(val: unknown, fallback: string = '08:00'): string {
  if (!val) return fallback;
  const str = String(val).trim();
  if (str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }
  const match = str.match(/(?:^|\s|T)?(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (match) {
    const h = String(parseInt(match[1], 10)).padStart(2, '0');
    const m = match[2];
    return `${h}:${m}`;
  }
  return fallback;
}

export function normalizeRoutineItem(item: RoutineItem): RoutineItem {
  return {
    ...item,
    time: normalizeTimeString(item.time, '08:00'),
    endTime: normalizeTimeString(item.endTime, '09:00'),
    days: Array.isArray(item.days) && item.days.length > 0 ? item.days : [0, 1, 2, 3, 4, 5, 6],
  };
}

