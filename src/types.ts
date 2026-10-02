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
