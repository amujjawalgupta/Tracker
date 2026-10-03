import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { RoutineItem } from './types';
import { normalizeTimeString, normalizeRoutineItem } from './types';
import { loadRoutineAsync, saveRoutineAsync, addMinutesToTime } from './storage';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Copy,
  ClipboardPaste,
  Clock,
  MoreVertical,
  ChevronDown,
} from 'lucide-react';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const DEFAULT_MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function to24(h: number, m: string, ampm: 'AM' | 'PM'): string {
  let hour = h;
  if (ampm === 'PM') {
    hour = h === 12 ? 12 : h + 12;
  } else {
    hour = h === 12 ? 0 : h;
  }
  const cleanM = String(parseInt(m, 10) || 0).padStart(2, '0');
  return `${String(hour).padStart(2, '0')}:${cleanM}`;
}

function from24(time24: string): { h: number; m: string; ampm: 'AM' | 'PM' } {
  const normalized = normalizeTimeString(time24, '08:00');
  const [hStr, mStr] = normalized.split(':');
  let hour = parseInt(hStr, 10);
  if (isNaN(hour)) hour = 8;
  const ampm: 'AM' | 'PM' = hour >= 12 ? 'PM' : 'AM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const rawM = parseInt(mStr, 10);
  const m = isNaN(rawM) ? '00' : String(rawM).padStart(2, '0');
  return { h, m, ampm };
}

function formatTime(time: string) {
  const { h, m, ampm } = from24(time);
  return `${h}:${m} ${ampm}`;
}

function getDuration(start: string, end: string): string {
  const sNorm = normalizeTimeString(start, '08:00');
  const eNorm = normalizeTimeString(end, '09:00');
  const [sh, sm] = sNorm.split(':').map(Number);
  const [eh, em] = eNorm.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (isNaN(diff) || diff <= 0) return '';
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

interface TimePickerProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}
function TimePicker({ label, value, onChange }: TimePickerProps) {
  const { h, m, ampm } = from24(value);
  const update = (newH: number, newM: string, newAmpm: 'AM' | 'PM') => {
    onChange(to24(newH, newM, newAmpm));
  };

  const minuteOptions = useMemo(() => {
    if (DEFAULT_MINUTES.includes(m)) return DEFAULT_MINUTES;
    return [...DEFAULT_MINUTES, m].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [m]);

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5 text-surface-600">{label}</label>
      <div className="flex items-center gap-1 p-2 rounded-xl border bg-surface-50 border-surface-200 focus-within:ring-2 focus-within:ring-primary-500/40">
        <div className="relative flex-1">
          <select
            value={h}
            onChange={e => update(parseInt(e.target.value, 10), m, ampm)}
            className="w-full appearance-none bg-transparent text-sm font-semibold text-center text-surface-800 focus:outline-none cursor-pointer py-1 pr-4"
          >
            {HOURS.map(hr => (
              <option key={hr} value={hr}>{String(hr).padStart(2, '0')}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-400 pointer-events-none" />
        </div>
        <span className="text-surface-400 font-bold text-sm">:</span>
        <div className="relative flex-1">
          <select
            value={m}
            onChange={e => update(h, e.target.value, ampm)}
            className="w-full appearance-none bg-transparent text-sm font-semibold text-center text-surface-800 focus:outline-none cursor-pointer py-1 pr-4"
          >
            {minuteOptions.map(mn => (
              <option key={mn} value={mn}>{mn}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-400 pointer-events-none" />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-surface-200 shrink-0">
          {(['AM', 'PM'] as const).map(period => (
            <button
              key={period}
              type="button"
              onClick={() => update(h, m, period)}
              className={`px-2.5 py-1 text-xs font-bold transition-all ${
                ampm === period
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-surface-500 hover:bg-surface-100'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface RoutineManagerProps {
  onBack: () => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMOJIS = ['🌅', '🏋️', '🥗', '💻', '🍱', '📖', '🚶', '🍽️', '📚', '😴', '☕', '🧘', '🎯', '📝', '🎵', '🚿', '💊', '🏃', '🎨', '🔥', '🧹', '🚰', '🌱', '💰', '📵'];

export function RoutineManager({ onBack }: RoutineManagerProps) {
  const [routine, setRoutine] = useState<RoutineItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());

  // Add/Edit form
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<RoutineItem | null>(null);
  const [formTime, setFormTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('09:00');
  const [formActivity, setFormActivity] = useState('');
  const [formEmoji, setFormEmoji] = useState('🎯');
  const [formDays, setFormDays] = useState<number[]>([new Date().getDay()]);

  // Edit scope dialog
  const [showEditScope, setShowEditScope] = useState(false);
  const [pendingEditItem, setPendingEditItem] = useState<RoutineItem | null>(null);

  // Copy day modal
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargetDays, setCopyTargetDays] = useState<number[]>([]);

  // Context menu
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [showCopyToModal, setShowCopyToModal] = useState(false);
  const [copyToItemId, setCopyToItemId] = useState<string | null>(null);
  const [copyToDays, setCopyToDays] = useState<number[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  // Load routine
  useEffect(() => {
    loadRoutineAsync().then(data => {
      setRoutine(data.map(normalizeRoutineItem));
      setLoaded(true);
      loadedRef.current = true;
    });
  }, []);

  // Save on change
  useEffect(() => {
    if (!loadedRef.current) return;
    saveRoutineAsync(routine);
  }, [routine]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuItemId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Items for selected day, sorted by time
  const dayItems = useMemo(() => {
    return routine
      .filter(item => item.days.includes(selectedDay))
      .sort((a, b) => {
        const tA = normalizeTimeString(a.time, '08:00');
        const tB = normalizeTimeString(b.time, '08:00');
        return tA.localeCompare(tB);
      });
  }, [routine, selectedDay]);

  // Count items per day for the tabs
  const dayCounts = useMemo(() => {
    return DAY_NAMES.map((_, day) =>
      routine.filter(item => item.days.includes(day)).length
    );
  }, [routine]);

  // ─── Form Handlers ──────────────────────────────────────────
  const resetForm = () => {
    setFormTime('08:00');
    setFormEndTime('09:00');
    setFormActivity('');
    setFormEmoji('🎯');
    setFormDays([selectedDay]);
    setShowAddForm(false);
    setEditingId(null);
    setEditingItem(null);
  };

  const openAddForm = () => {
    resetForm();
    setFormDays([selectedDay]);
    setShowAddForm(true);
  };

  // Called when user clicks Edit from the context menu
  const handleEditClick = (item: RoutineItem) => {
    setMenuItemId(null);
    if (item.days.length > 1) {
      setPendingEditItem(item);
      setShowEditScope(true);
    } else {
      openEditForm(item, item.days);
    }
  };

  const openEditForm = (item: RoutineItem, days: number[]) => {
    setEditingId(item.id);
    setEditingItem(item);
    setFormTime(normalizeTimeString(item.time, '08:00'));
    setFormEndTime(normalizeTimeString(item.endTime, '09:00'));
    setFormActivity(item.activity);
    setFormEmoji(item.emoji);
    setFormDays([...days]);
    setShowAddForm(true);
    setShowEditScope(false);
    setPendingEditItem(null);
  };

  // Detach selected day from multi-day item, then edit the detached copy
  const editThisDayOnly = () => {
    if (!pendingEditItem) return;
    const updatedOriginal = { ...pendingEditItem, days: pendingEditItem.days.filter(d => d !== selectedDay) };
    const detachedId = crypto.randomUUID();
    const detachedItem: RoutineItem = {
      ...pendingEditItem,
      id: detachedId,
      time: normalizeTimeString(pendingEditItem.time, '08:00'),
      endTime: normalizeTimeString(pendingEditItem.endTime, '09:00'),
      days: [selectedDay]
    };
    setRoutine(prev => [
      ...prev.filter(r => r.id !== pendingEditItem.id),
      ...(updatedOriginal.days.length > 0 ? [updatedOriginal] : []),
      detachedItem,
    ]);
    setTimeout(() => openEditForm(detachedItem, [selectedDay]), 50);
  };

  const editAllDays = () => {
    if (!pendingEditItem) return;
    openEditForm(pendingEditItem, pendingEditItem.days);
  };

  const saveItem = useCallback(() => {
    if (!formActivity.trim()) return;

    const cleanTime = normalizeTimeString(formTime, '08:00');
    const cleanEndTime = normalizeTimeString(formEndTime, '09:00');

    if (editingId) {
      setRoutine(prev => prev.map(r =>
        r.id === editingId
          ? { ...r, time: cleanTime, endTime: cleanEndTime, activity: formActivity.trim(), emoji: formEmoji, days: formDays }
          : r
      ));
    } else {
      const newItem: RoutineItem = {
        id: crypto.randomUUID(),
        time: cleanTime,
        endTime: cleanEndTime,
        activity: formActivity.trim(),
        emoji: formEmoji,
        days: formDays,
      };
      setRoutine(prev => [...prev, newItem]);
    }
    resetForm();
  }, [editingId, formTime, formEndTime, formActivity, formEmoji, formDays]);

  const deleteItem = useCallback((id: string) => {
    setRoutine(prev => prev.filter(r => r.id !== id));
    setMenuItemId(null);
  }, []);

  const duplicateItem = useCallback((id: string) => {
    setRoutine(prev => {
      const item = prev.find(r => r.id === id);
      if (!item) return prev;
      const newItem: RoutineItem = {
        ...item,
        id: crypto.randomUUID(),
        time: addMinutesToTime(item.time, 30),
        endTime: addMinutesToTime(item.endTime, 30),
      };
      return [...prev, newItem];
    });
    setMenuItemId(null);
  }, []);

  // ─── Copy Day ───────────────────────────────────────────────
  const openCopyDay = () => {
    setCopyTargetDays([]);
    setShowCopyModal(true);
  };

  const executeCopyDay = useCallback(() => {
    if (copyTargetDays.length === 0) return;
    const sourceItems = routine.filter(r => r.days.includes(selectedDay));

    setRoutine(prev => {
      const newItems: RoutineItem[] = [];
      for (const item of sourceItems) {
        for (const targetDay of copyTargetDays) {
          // Check if this item already applies to the target day
          if (item.days.includes(targetDay)) continue;

          // Check if there's already a matching item on target day
          const exists = prev.some(
            r => r.days.includes(targetDay) && r.time === item.time && r.activity === item.activity
          );
          if (exists) continue;

          newItems.push({
            ...item,
            id: crypto.randomUUID(),
            days: [targetDay],
          });
        }
      }
      return [...prev, ...newItems];
    });

    setShowCopyModal(false);
    setCopyTargetDays([]);
  }, [copyTargetDays, routine, selectedDay]);

  // ─── Copy Item to Day ───────────────────────────────────────
  const openCopyTo = (id: string) => {
    setCopyToItemId(id);
    setCopyToDays([]);
    setShowCopyToModal(true);
    setMenuItemId(null);
  };

  const executeCopyTo = useCallback(() => {
    if (!copyToItemId || copyToDays.length === 0) return;
    const item = routine.find(r => r.id === copyToItemId);
    if (!item) return;

    setRoutine(prev => {
      const newItems: RoutineItem[] = [];
      for (const day of copyToDays) {
        if (item.days.includes(day)) continue;
        newItems.push({
          ...item,
          id: crypto.randomUUID(),
          days: [day],
        });
      }
      return [...prev, ...newItems];
    });

    setShowCopyToModal(false);
    setCopyToItemId(null);
    setCopyToDays([]);
  }, [copyToItemId, copyToDays, routine]);

  const toggleDay = (day: number, arr: number[], setter: (d: number[]) => void) => {
    if (arr.includes(day)) {
      setter(arr.filter(d => d !== day));
    } else {
      setter([...arr, day]);
    }
  };

  const isCurrentTimeSlot = (time: string, endTime: string) => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const sNorm = normalizeTimeString(time, '08:00');
    const eNorm = normalizeTimeString(endTime, '09:00');
    const [sh, sm] = sNorm.split(':').map(Number);
    const [eh, em] = eNorm.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    return now.getDay() === selectedDay && nowMinutes >= startMin && nowMinutes < endMin;
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-primary-50/30 to-surface-100">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-primary-50/30 to-surface-100">
      {/* ─── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/70 border-surface-200/60">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-surface-100 text-surface-600 transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/25">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold leading-tight tracking-tight text-surface-800">
                  Weekly Routine
                </h1>
                <p className="text-xs text-surface-500 hidden sm:block">
                  Plan your daily schedule
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCopyDay}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:bg-surface-100 text-surface-600 transition-all hover:scale-105 active:scale-95 border border-surface-200"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span className="hidden sm:inline">Copy Day</span>
            </button>
            <button
              onClick={openAddForm}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium text-sm shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Activity</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Day Tabs ─────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4">
        <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-3">
          {DAY_NAMES.map((_name, idx) => {
            const isToday = new Date().getDay() === idx;
            const isSelected = selectedDay === idx;
            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(idx)}
                className={`relative flex flex-col items-center gap-0.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all hover:scale-105 active:scale-95 shrink-0 ${
                  isSelected
                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25'
                    : isToday
                      ? 'bg-primary-50 text-primary-700 border border-primary-200'
                      : 'bg-white/80 text-surface-600 hover:bg-surface-50 border border-surface-200/60'
                }`}
              >
                <span className="font-bold">{DAY_SHORT[idx]}</span>
                <span className={`text-[10px] ${
                  isSelected ? 'text-white/70' : 'text-surface-400'
                }`}>
                  {dayCounts[idx]} items
                </span>
                {isToday && !isSelected && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Schedule Content ─────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <div className="rounded-2xl border bg-white/80 border-surface-200/60 shadow-sm overflow-visible">
          {/* Day Header */}
          <div className="px-5 py-3 border-b border-surface-200/60 flex items-center justify-between">
            <h2 className="text-base font-bold text-surface-800">
              {DAY_NAMES[selectedDay]}'s Schedule
            </h2>
            <span className="text-xs text-surface-400 font-medium">
              {dayItems.length} {dayItems.length === 1 ? 'activity' : 'activities'}
            </span>
          </div>

          {/* Items List */}
          <div className="divide-y divide-surface-100">
            {dayItems.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">📋</div>
                <div className="text-lg font-semibold text-surface-600 mb-1">No activities scheduled</div>
                <div className="text-sm text-surface-400 mb-4">Add your first activity for {DAY_NAMES[selectedDay]}</div>
                <button
                  onClick={openAddForm}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium text-sm shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all hover:scale-105 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Add Activity
                </button>
              </div>
            ) : (
              dayItems.map((item, idx) => {
                const isCurrent = isCurrentTimeSlot(item.time, item.endTime);
                return (
                  <div
                    key={item.id}
                    className={`group relative flex items-start sm:items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-3.5 transition-all ${
                      isCurrent
                        ? 'bg-primary-50/80 border-l-[3px] border-l-primary-500'
                        : idx % 2 === 0
                          ? 'hover:bg-surface-50/80'
                          : 'bg-surface-50/30 hover:bg-surface-50/80'
                    }`}
                  >
                    {/* Time Column */}
                    <div className="w-[80px] sm:w-[120px] shrink-0">
                      <div className="flex items-center gap-1.5">
                        {isCurrent && (
                          <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse shrink-0" />
                        )}
                        <span className={`text-sm font-mono font-bold tabular-nums ${
                          isCurrent ? 'text-primary-700' : 'text-surface-600'
                        }`}>
                          {formatTime(item.time)}
                        </span>
                      </div>
                      <span className="text-[11px] text-surface-400 font-mono">
                        → {formatTime(item.endTime)}
                      </span>
                    </div>

                    {/* Activity */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${
                        isCurrent ? 'text-primary-800' : 'text-surface-800'
                      }`}>
                        <span className="mr-1.5">{item.emoji}</span>
                        {item.activity}
                      </div>
                      {/* Day badges */}
                      <div className="flex gap-1 mt-1">
                        {item.days.length === 7 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-600 font-medium">
                            Every day
                          </span>
                        ) : (
                          item.days.sort().map(d => (
                            <span
                              key={d}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                d === selectedDay
                                  ? 'bg-primary-100 text-primary-600'
                                  : 'bg-surface-100 text-surface-500'
                              }`}
                            >
                              {DAY_SHORT[d]}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setMenuItemId(menuItemId === item.id ? null : item.id)}
                        className="p-2 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-all"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuItemId === item.id && (
                        <div
                          ref={menuRef}
                          className={`absolute right-0 z-50 w-44 rounded-xl bg-white shadow-xl border border-surface-200 py-1.5 fade-in ${
                            idx >= dayItems.length - 2 ? 'bottom-10' : 'top-10'
                          }`}
                        >
                          <button
                            onClick={() => handleEditClick(item)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => duplicateItem(item.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </button>
                          <button
                            onClick={() => openCopyTo(item.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 transition-colors"
                          >
                            <ClipboardPaste className="w-3.5 h-3.5" /> Copy to Day...
                          </button>
                          <div className="my-1 border-t border-surface-100" />
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${item.activity}"?`)) deleteItem(item.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          EDIT SCOPE DIALOG
          ═══════════════════════════════════════════════════════ */}
      {showEditScope && pendingEditItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowEditScope(false); setPendingEditItem(null); }} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl fade-in bg-white border border-surface-200">
            <div className="text-center mb-5">
              <div className="text-3xl mb-3">{pendingEditItem.emoji}</div>
              <h2 className="text-lg font-bold text-surface-800 mb-1">Edit "{pendingEditItem.activity}"</h2>
              <p className="text-sm text-surface-500">
                This runs on{' '}
                <strong>{pendingEditItem.days.sort().map(d => DAY_SHORT[d]).join(', ')}</strong>.
                {' '}What would you like to edit?
              </p>
            </div>
            <div className="space-y-2.5">
              <button
                onClick={editThisDayOnly}
                className="w-full flex flex-col items-start gap-0.5 px-4 py-3.5 rounded-xl border-2 border-primary-500 bg-primary-50 text-left hover:bg-primary-100 transition-all"
              >
                <span className="text-sm font-bold text-primary-700">✏️ Edit for {DAY_NAMES[selectedDay]} only</span>
                <span className="text-xs text-primary-600">Detaches this day so changes only apply to {DAY_SHORT[selectedDay]}</span>
              </button>
              <button
                onClick={editAllDays}
                className="w-full flex flex-col items-start gap-0.5 px-4 py-3.5 rounded-xl border-2 border-surface-200 bg-surface-50 text-left hover:bg-surface-100 transition-all"
              >
                <span className="text-sm font-bold text-surface-700">📅 Edit for all days</span>
                <span className="text-xs text-surface-500">Changes apply to all {pendingEditItem.days.length} days</span>
              </button>
            </div>
            <button
              onClick={() => { setShowEditScope(false); setPendingEditItem(null); }}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium bg-surface-100 hover:bg-surface-200 text-surface-600 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ADD / EDIT MODAL
          ═══════════════════════════════════════════════════════ */}
      {showAddForm && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={resetForm} />
          <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl slide-up sm:fade-in bg-white border border-surface-200 max-h-[90vh] overflow-y-auto">
            <div className="mobile-sheet-handle sm:hidden" />
            <h2 className="text-xl font-bold mb-5 flex items-center gap-2 text-surface-800">
              {editingId ? (
                <><Pencil className="w-5 h-5 text-primary-500" /> Edit Activity</>
              ) : (
                <><Plus className="w-5 h-5 text-primary-500" /> Add Activity</>
              )}
            </h2>

            {/* Note when editing a single-day detached item */}
            {editingId && editingItem && editingItem.days.length === 1 && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium">
                ✏️ Editing only for <strong>{DAY_NAMES[editingItem.days[0]]}</strong>
              </div>
            )}

            <div className="space-y-4">
              {/* Activity Name */}
              <div>
                <label className="block text-sm font-medium mb-1.5 text-surface-600">Activity Name</label>
                <input
                  type="text"
                  value={formActivity}
                  onChange={e => setFormActivity(e.target.value)}
                  placeholder="e.g., Morning Workout"
                  onKeyDown={e => e.key === 'Enter' && saveItem()}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40 bg-surface-50 border-surface-200 text-surface-900 placeholder:text-surface-400"
                  autoFocus
                />
              </div>

              {/* Time Range — custom pickers */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <TimePicker label="Start Time" value={formTime} onChange={setFormTime} />
                </div>
                <div className="flex-1">
                  <TimePicker label="End Time" value={formEndTime} onChange={setFormEndTime} />
                </div>
              </div>

              {/* Duration badge */}
              {getDuration(formTime, formEndTime) && (
                <div className="flex items-center gap-1.5 -mt-2">
                  <Clock className="w-3.5 h-3.5 text-primary-500" />
                  <span className="text-xs font-medium text-primary-600">{getDuration(formTime, formEndTime)} duration</span>
                </div>
              )}

              {/* Emoji Picker */}
              <div>
                <label className="block text-sm font-medium mb-1.5 text-surface-600">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setFormEmoji(emoji)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all hover:scale-110 ${
                        formEmoji === emoji
                          ? 'bg-primary-500/20 ring-2 ring-primary-500 scale-110'
                          : 'hover:bg-surface-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Days Selector */}
              <div>
                <label className="block text-sm font-medium mb-1.5 text-surface-600">
                  Apply to Days
                </label>
                <div className="flex gap-1.5">
                  {DAY_SHORT.map((name, idx) => (
                    <button
                      key={idx}
                      onClick={() => toggleDay(idx, formDays, setFormDays)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                        formDays.includes(idx)
                          ? 'bg-primary-500 text-white shadow-sm'
                          : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setFormDays([0,1,2,3,4,5,6])}
                    className="text-[11px] text-primary-600 hover:text-primary-700 font-medium"
                  >
                    All Days
                  </button>
                  <button
                    onClick={() => setFormDays([1,2,3,4,5])}
                    className="text-[11px] text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Weekdays
                  </button>
                  <button
                    onClick={() => setFormDays([0,6])}
                    className="text-[11px] text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Weekends
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={resetForm}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all bg-surface-100 hover:bg-surface-200 text-surface-600"
              >
                Cancel
              </button>
              <button
                onClick={saveItem}
                disabled={!formActivity.trim() || formDays.length === 0}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              >
                {editingId ? 'Save Changes' : 'Add Activity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          COPY DAY MODAL
          ═══════════════════════════════════════════════════════ */}
      {showCopyModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCopyModal(false)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl slide-up sm:fade-in bg-white border border-surface-200">
            <div className="mobile-sheet-handle sm:hidden" />
            <h2 className="text-lg font-bold mb-1 text-surface-800">Copy Day</h2>
            <p className="text-sm text-surface-500 mb-4">
              Copy all {dayItems.length} activities from <strong>{DAY_NAMES[selectedDay]}</strong> to:
            </p>

            <div className="flex flex-wrap gap-2 mb-5">
              {DAY_NAMES.map((_name, idx) => {
                if (idx === selectedDay) return null;
                return (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx, copyTargetDays, setCopyTargetDays)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      copyTargetDays.includes(idx)
                        ? 'bg-primary-500 text-white shadow-sm'
                        : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                    }`}
                  >
                    {DAY_SHORT[idx]}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCopyModal(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-surface-100 hover:bg-surface-200 text-surface-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={executeCopyDay}
                disabled={copyTargetDays.length === 0}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Copy to {copyTargetDays.length} day{copyTargetDays.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          COPY ITEM TO DAY MODAL
          ═══════════════════════════════════════════════════════ */}
      {showCopyToModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCopyToModal(false)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl slide-up sm:fade-in bg-white border border-surface-200">
            <div className="mobile-sheet-handle sm:hidden" />
            <h2 className="text-lg font-bold mb-1 text-surface-800">Copy to Day</h2>
            <p className="text-sm text-surface-500 mb-4">
              Copy this activity to:
            </p>

            <div className="flex flex-wrap gap-2 mb-5">
              {DAY_NAMES.map((_name, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx, copyToDays, setCopyToDays)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    copyToDays.includes(idx)
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                  }`}
                >
                  {DAY_SHORT[idx]}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCopyToModal(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-surface-100 hover:bg-surface-200 text-surface-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={executeCopyTo}
                disabled={copyToDays.length === 0}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
