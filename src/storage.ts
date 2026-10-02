import type { TrackerData, Habit, DayEntry, Theme, QuickNote, RoutineItem } from './types';
import {
  fetchAllData,
  syncFullData,
  syncHabits,
  syncEntryToggle,
  syncNotes,
  syncRoutine,
} from './api';

// ─── Default Data (Fallback when completely empty) ──────────────

export function getDefaultData(): TrackerData {
  return {
    habits: [
      { id: crypto.randomUUID(), name: 'Wake up at 06:00', emoji: '⏰', monthlyGoal: 25, createdAt: new Date().toISOString(), order: 0 },
      { id: crypto.randomUUID(), name: 'Workout', emoji: '🏋️', monthlyGoal: 26, createdAt: new Date().toISOString(), order: 1 },
      { id: crypto.randomUUID(), name: 'Read 20 Pages', emoji: '📖', monthlyGoal: 24, createdAt: new Date().toISOString(), order: 2 },
      { id: crypto.randomUUID(), name: 'Meditate', emoji: '🧘', monthlyGoal: 28, createdAt: new Date().toISOString(), order: 3 },
      { id: crypto.randomUUID(), name: 'No Junk Food', emoji: '🥗', monthlyGoal: 27, createdAt: new Date().toISOString(), order: 4 },
      { id: crypto.randomUUID(), name: 'Budget Tracking', emoji: '💰', monthlyGoal: 23, createdAt: new Date().toISOString(), order: 5 },
      { id: crypto.randomUUID(), name: 'Social Media Detox', emoji: '📵', monthlyGoal: 23, createdAt: new Date().toISOString(), order: 6 },
      { id: crypto.randomUUID(), name: 'Journal My Day', emoji: '📝', monthlyGoal: 28, createdAt: new Date().toISOString(), order: 7 },
      { id: crypto.randomUUID(), name: 'Cold Shower', emoji: '🚿', monthlyGoal: 24, createdAt: new Date().toISOString(), order: 8 },
      { id: crypto.randomUUID(), name: 'Eat Healthy', emoji: '🍎', monthlyGoal: 26, createdAt: new Date().toISOString(), order: 9 },
    ],
    entries: [],
    version: 1,
  };
}

// ─── Real-Time Load / Save (Google Sheets Backend) ────────────

export async function loadDataAsync(): Promise<TrackerData> {
  try {
    const { data } = await fetchAllData(false);
    if (data && data.habits && data.habits.length > 0) {
      return data;
    }
  } catch (e) {
    console.error('Failed to load habits data from backend:', e);
  }

  // If empty, return defaults and sync to Google Sheets
  const defaults = getDefaultData();
  await saveDataAsync(defaults);
  return defaults;
}

export async function saveDataAsync(data: TrackerData): Promise<void> {
  await syncFullData(data);
}

// ─── Theme ─────────────────────────────────────────────────────

export function loadTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function saveTheme(_theme: Theme): void {
  // Local storage removed as requested
}

// ─── Habit CRUD (Pure Functions) ───────────────────────────────

export function addHabit(data: TrackerData, name: string, emoji: string, monthlyGoal: number): TrackerData {
  const maxOrder = data.habits.reduce((max, h) => Math.max(max, h.order), -1);
  const newHabit: Habit = {
    id: crypto.randomUUID(),
    name,
    emoji,
    monthlyGoal,
    createdAt: new Date().toISOString(),
    order: maxOrder + 1,
  };
  const updated = { ...data, habits: [...data.habits, newHabit] };
  // Real-time sync to backend
  syncHabits(updated.habits);
  return updated;
}

export function updateHabit(data: TrackerData, id: string, updates: Partial<Habit>): TrackerData {
  const updated = {
    ...data,
    habits: data.habits.map(h => (h.id === id ? { ...h, ...updates } : h)),
  };
  // Real-time sync to backend
  syncHabits(updated.habits);
  return updated;
}

export function deleteHabit(data: TrackerData, id: string): TrackerData {
  return {
    ...data,
    habits: data.habits.filter(h => h.id !== id),
    entries: data.entries.filter(e => e.habitId !== id),
  };
}

export function reorderHabits(data: TrackerData, orderedIds: string[]): TrackerData {
  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  const updated = {
    ...data,
    habits: data.habits.map(h => ({
      ...h,
      order: orderMap.get(h.id) ?? h.order,
    })),
  };
  // Real-time sync to backend
  syncHabits(updated.habits);
  return updated;
}

// ─── Entries ───────────────────────────────────────────────────

export function toggleEntry(data: TrackerData, habitId: string, date: string): TrackerData {
  const existing = data.entries.find(e => e.habitId === habitId && e.date === date);
  let updated: TrackerData;
  let willBeCompleted = true;

  if (existing) {
    if (existing.completed) {
      willBeCompleted = false;
      updated = { ...data, entries: data.entries.filter(e => !(e.habitId === habitId && e.date === date)) };
    } else {
      updated = {
        ...data,
        entries: data.entries.map(e =>
          e.habitId === habitId && e.date === date ? { ...e, completed: true } : e
        ),
      };
    }
  } else {
    const newEntry: DayEntry = { habitId, date, completed: true };
    updated = { ...data, entries: [...data.entries, newEntry] };
  }

  // Real-time sync to backend
  syncEntryToggle(habitId, date, willBeCompleted);
  return updated;
}

export function isCompleted(data: TrackerData, habitId: string, date: string): boolean {
  return data.entries.some(e => e.habitId === habitId && e.date === date && e.completed);
}

// ─── Export / Import ───────────────────────────────────────────

export function exportData(data: TrackerData, notes: QuickNote[], routine: RoutineItem[]): string {
  const exportObj = {
    ...data,
    notes,
    routine
  };
  return JSON.stringify(exportObj, null, 2);
}

export function importData(json: string): (TrackerData & { notes?: QuickNote[]; routine?: RoutineItem[] }) | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && Array.isArray(parsed.habits) && Array.isArray(parsed.entries)) {
      return parsed;
    }
  } catch {
    console.error('Invalid import data');
  }
  return null;
}

// ─── Date helpers ──────────────────────────────────────────────

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const count = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= count; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

export function getCompletedCount(data: TrackerData, date: string): number {
  return data.entries.filter(e => e.date === date && e.completed).length;
}

export function getHabitCompletedDays(data: TrackerData, habitId: string, year: number, month: number): number {
  const days = getDaysInMonth(year, month);
  return days.reduce((count, day) => {
    return count + (isCompleted(data, habitId, formatDateKey(day)) ? 1 : 0);
  }, 0);
}

// ─── Quick Notes ───────────────────────────────────────────────

export async function loadNotesAsync(): Promise<QuickNote[]> {
  try {
    const { notes } = await fetchAllData(false);
    return notes || [];
  } catch (e) {
    console.error('Failed to load notes from backend:', e);
    return [];
  }
}

export async function saveNotesAsync(notes: QuickNote[]): Promise<void> {
  await syncNotes(notes);
}

// ─── Daily Routine ─────────────────────────────────────────────

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const DEFAULT_ROUTINE: RoutineItem[] = [
  { id: crypto.randomUUID(), time: '06:00', endTime: '06:30', activity: 'Wake Up & Stretch', emoji: '🌅', days: ALL_DAYS },
  { id: crypto.randomUUID(), time: '06:30', endTime: '07:30', activity: 'Morning Workout', emoji: '🏋️', days: [1,2,3,4,5] },
  { id: crypto.randomUUID(), time: '07:30', endTime: '08:00', activity: 'Breakfast', emoji: '🥗', days: ALL_DAYS },
  { id: crypto.randomUUID(), time: '08:00', endTime: '12:00', activity: 'Deep Work Block', emoji: '💻', days: [1,2,3,4,5] },
  { id: crypto.randomUUID(), time: '12:00', endTime: '13:00', activity: 'Lunch Break', emoji: '🍱', days: ALL_DAYS },
  { id: crypto.randomUUID(), time: '13:00', endTime: '17:00', activity: 'Focused Study', emoji: '📖', days: [1,2,3,4,5] },
  { id: crypto.randomUUID(), time: '17:00', endTime: '18:00', activity: 'Exercise / Walk', emoji: '🚶', days: ALL_DAYS },
  { id: crypto.randomUUID(), time: '19:00', endTime: '19:45', activity: 'Dinner', emoji: '🍽️', days: ALL_DAYS },
  { id: crypto.randomUUID(), time: '20:00', endTime: '21:30', activity: 'Reading / Hobby', emoji: '📚', days: ALL_DAYS },
  { id: crypto.randomUUID(), time: '22:00', endTime: '22:30', activity: 'Wind Down & Sleep', emoji: '😴', days: ALL_DAYS },
];

export async function loadRoutineAsync(): Promise<RoutineItem[]> {
  try {
    const { routine } = await fetchAllData(false);
    if (routine && routine.length > 0) return routine;
  } catch (e) {
    console.error('Failed to load routine from backend:', e);
  }
  return DEFAULT_ROUTINE;
}

export async function saveRoutineAsync(routine: RoutineItem[]): Promise<void> {
  await syncRoutine(routine);
}
