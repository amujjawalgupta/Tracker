import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { TrackerData, Habit, Theme, DayInfo } from './types';
import { formatDateKey, isCompleted, getHabitCompletedDays } from './storage';
import {
  Check,
  Trash2,
  Pencil,
  X,
  Save,
  GripVertical,
  Calendar,
  CalendarDays,
  CalendarRange,
  Plus,
} from 'lucide-react';

interface HabitGridProps {
  data: TrackerData;
  habits: Habit[];
  days: Date[];
  today: string;
  theme: Theme;
  selectedYear: number;
  selectedMonth: number;
  onToggle: (habitId: string, date: string) => void;
  onUpdateHabit: (id: string, updates: { name?: string; emoji?: string; monthlyGoal?: number }) => void;
  onDeleteHabit: (habit: Habit) => void;
  onReorderHabits: (orderedIds: string[]) => void;
  onOpenAddModal?: () => void;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function groupIntoWeeks(days: Date[]): DayInfo[][] {
  const weeks: DayInfo[][] = [];
  let currentWeek: DayInfo[] = [];
  const todayStr = formatDateKey(new Date());

  for (const day of days) {
    const dow = day.getDay();
    if (dow === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push({
      date: day,
      dayOfWeek: DAY_ABBR[dow],
      dayNumber: day.getDate(),
      isToday: formatDateKey(day) === todayStr,
      dateString: formatDateKey(day),
    });
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);
  return weeks;
}

export function HabitGrid({
  data,
  habits,
  days,
  today,
  theme,
  selectedYear,
  selectedMonth,
  onToggle,
  onUpdateHabit,
  onDeleteHabit,
  onReorderHabits,
  onOpenAddModal,
}: HabitGridProps) {
  // Mobile / Desktop View Mode: 'today' | 'week' | 'month'
  const [viewMode, setViewMode] = useState<'today' | 'week' | 'month'>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 'today' : 'month';
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGoal, setEditGoal] = useState(25);
  const [recentlyToggled, setRecentlyToggled] = useState<Set<string>>(new Set());
  const nameInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // ─── Drag & Drop State ─────────────────────────────────────
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);
  const dragCounter = useRef(0);

  const weeks = useMemo(() => groupIntoWeeks(days), [days]);

  // Current week for 'week' view mode
  const currentWeek = useMemo(() => {
    const found = weeks.find(w => w.some(d => d.dateString === today));
    return found || weeks[0] || [];
  }, [weeks, today]);

  // Auto-scroll to today in month view on mount
  useEffect(() => {
    if (viewMode === 'month' && tableContainerRef.current) {
      const todayEl = tableContainerRef.current.querySelector('.today-cell-header');
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [viewMode, selectedMonth, selectedYear]);

  const startEdit = useCallback((habit: Habit) => {
    setEditingId(habit.id);
    setEditName(habit.name);
    setEditGoal(habit.monthlyGoal);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId || !editName.trim()) return;
    onUpdateHabit(editingId, { name: editName.trim(), monthlyGoal: editGoal });
    setEditingId(null);
  }, [editingId, editName, editGoal, onUpdateHabit]);

  const handleToggle = useCallback((habitId: string, dateStr: string) => {
    const key = `${habitId}-${dateStr}`;
    onToggle(habitId, dateStr);
    setRecentlyToggled(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setTimeout(() => {
      setRecentlyToggled(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 300);
  }, [onToggle]);

  // ─── Drag Handlers ─────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, habitId: string) => {
    setDraggedId(habitId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', habitId);
    const target = e.currentTarget as HTMLElement;
    setTimeout(() => target.style.opacity = '0.4', 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    setDraggedId(null);
    setDragOverId(null);
    setDropPosition(null);
    dragCounter.current = 0;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, habitId: string) => {
    e.preventDefault();
    dragCounter.current++;
    if (habitId !== draggedId) {
      setDragOverId(habitId);
    }
  }, [draggedId]);

  const handleDragLeave = useCallback((_e: React.DragEvent) => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverId(null);
      setDropPosition(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, habitId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (habitId === draggedId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'above' : 'below';
    setDropPosition(pos);
    setDragOverId(habitId);
  }, [draggedId]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const currentOrder = habits.map(h => h.id);
    const dragIdx = currentOrder.indexOf(draggedId);
    const targetIdx = currentOrder.indexOf(targetId);

    if (dragIdx === -1 || targetIdx === -1) return;

    const newOrder = currentOrder.filter(id => id !== draggedId);
    let insertIdx = newOrder.indexOf(targetId);
    if (dropPosition === 'below') insertIdx++;
    newOrder.splice(insertIdx, 0, draggedId);

    onReorderHabits(newOrder);
    setDraggedId(null);
    setDragOverId(null);
    setDropPosition(null);
    dragCounter.current = 0;
  }, [draggedId, habits, dropPosition, onReorderHabits]);

  // Which weeks to render based on viewMode
  const displayedWeeks = viewMode === 'week' ? [currentWeek] : weeks;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-colors ${
      theme === 'dark'
        ? 'bg-surface-900/60 border-surface-700/50'
        : 'bg-white/80 border-surface-200/60 shadow-sm'
    }`}>
      {/* ─── View Switcher Bar (Today / Week / Month) ──────────── */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 border-b border-surface-200/60 bg-surface-50/70">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-xs font-bold text-surface-600 hidden sm:inline">View:</span>
          <div className="flex items-center p-1 rounded-xl bg-surface-200/60 border border-surface-300/40 text-xs font-semibold">
            <button
              onClick={() => setViewMode('today')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg transition-all ${
                viewMode === 'today'
                  ? 'bg-white text-primary-700 shadow-xs font-bold'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Today</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg transition-all ${
                viewMode === 'week'
                  ? 'bg-white text-primary-700 shadow-xs font-bold'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Week</span>
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg transition-all ${
                viewMode === 'month'
                  ? 'bg-white text-primary-700 shadow-xs font-bold'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span>Month</span>
            </button>
          </div>
        </div>

        <div className="text-[11px] font-medium text-surface-500 flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-surface-200/60 font-semibold">
            {habits.length} habits
          </span>
          {onOpenAddModal && (
            <button
              onClick={onOpenAddModal}
              className="sm:hidden p-1.5 rounded-lg bg-primary-500 text-white shadow-xs"
              title="Add Habit"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MODE 1: TODAY VIEW (Phone Focus Card List)
          ═══════════════════════════════════════════════════════ */}
      {viewMode === 'today' && (
        <div className="p-3 sm:p-4 space-y-2.5 fade-in">
          {habits.map((habit) => {
            const completedDays = getHabitCompletedDays(data, habit.id, selectedYear, selectedMonth);
            const goalPct = Math.min(100, Math.round((completedDays / habit.monthlyGoal) * 100));
            const checked = isCompleted(data, habit.id, today);
            const toggleKey = `${habit.id}-${today}`;
            const justToggled = recentlyToggled.has(toggleKey);
            const isEditing = editingId === habit.id;

            return (
              <div
                key={habit.id}
                className={`flex items-center justify-between p-3 sm:p-4 rounded-xl border transition-all ${
                  checked
                    ? 'bg-primary-50/70 border-primary-200/80 shadow-xs'
                    : 'bg-white border-surface-200/80 hover:border-surface-300'
                }`}
              >
                {/* Left: Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                  <span className="text-2xl shrink-0">{habit.emoji}</span>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={nameInputRef}
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="px-2 py-1 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white border-surface-300"
                        />
                        <button onClick={saveEdit} className="p-1 text-success-600"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-surface-400"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <h3 className={`text-sm font-bold truncate ${
                          checked ? 'text-primary-950 line-through opacity-85' : 'text-surface-800'
                        }`}>
                          {habit.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[11px] font-semibold tabular-nums ${
                            goalPct >= 100 ? 'text-success-600' : 'text-surface-500'
                          }`}>
                            {completedDays}/{habit.monthlyGoal} days ({goalPct}%)
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-surface-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                goalPct >= 100 ? 'bg-success-500' : 'bg-primary-500'
                              }`}
                              style={{ width: `${goalPct}%` }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Actions & Big Checkbox */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(habit)}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                    title="Edit habit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteHabit(habit);
                    }}
                    className="p-2 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                    title="Delete habit"
                    aria-label={`Delete ${habit.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Big Touch Checkbox Button */}
                  <button
                    onClick={() => handleToggle(habit.id, today)}
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-200 cursor-pointer hover:scale-105 active:scale-90 ml-1 ${
                      checked
                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 border-primary-500 shadow-md shadow-primary-500/30'
                        : 'border-surface-300 hover:border-primary-400 bg-white'
                    }`}
                    aria-label={`Toggle ${habit.name} for today`}
                  >
                    {checked && (
                      <Check className={`w-5 h-5 text-white stroke-[3] ${justToggled ? 'check-animate' : ''}`} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {habits.length === 0 && (
            <div className="text-center py-12 text-surface-400">
              <div className="text-3xl mb-2">🎯</div>
              <p className="text-sm font-semibold">No habits yet</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODE 2 & 3: WEEK VIEW & MONTH SPREADSHEET VIEW
          ═══════════════════════════════════════════════════════ */}
      {(viewMode === 'week' || viewMode === 'month') && (
        <div ref={tableContainerRef} className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '240px' }} />
              <col style={{ width: '76px' }} />
              {displayedWeeks.flatMap((week, wi) =>
                week.map((_, di) => (
                  <col key={`col-${wi}-${di}`} style={{ width: '36px' }} />
                ))
              )}
            </colgroup>
            <thead>
              {/* ─── Week Group Headers ────────────────────── */}
              <tr>
                <th
                  colSpan={2}
                  className={`sticky left-0 z-30 px-3 sm:px-4 py-2 text-left text-xs font-bold uppercase tracking-wider border-b border-r-2 ${
                    theme === 'dark'
                      ? 'bg-surface-800 text-surface-300 border-b-surface-700/60 border-r-surface-700/60'
                      : 'bg-surface-100/95 text-surface-600 border-b-surface-200 border-r-surface-200'
                  }`}
                  style={{ backdropFilter: 'blur(8px)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] sm:text-xs font-extrabold tracking-wider">HABITS & GOALS</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-200/80 text-surface-600">
                      {habits.length}
                    </span>
                  </div>
                </th>
                {displayedWeeks.map((week, wi) => (
                  <th
                    key={`week-${wi}`}
                    colSpan={week.length}
                    className={`px-1 py-1.5 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-wider border-b ${
                      theme === 'dark'
                        ? 'bg-surface-800/95 text-primary-400 border-surface-700/50'
                        : 'bg-surface-50/95 text-primary-700 border-surface-200'
                    } ${wi > 0 ? (theme === 'dark' ? 'border-l border-surface-700/40' : 'border-l border-surface-200') : ''}`}
                  >
                    Week {viewMode === 'week' ? 'Current' : wi + 1}
                  </th>
                ))}
              </tr>

              {/* ─── Column & Day Header Row ───────────────────────── */}
              <tr>
                <th
                  className={`sticky left-0 z-30 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider border-b ${
                    theme === 'dark'
                      ? 'bg-surface-800 text-surface-400 border-surface-700/50'
                      : 'bg-surface-50 text-surface-500 border-surface-200'
                  }`}
                  style={{ backdropFilter: 'blur(8px)' }}
                >
                  Habit Name
                </th>
                <th
                  className={`sticky left-[240px] z-30 px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wider border-b border-r-2 ${
                    theme === 'dark'
                      ? 'bg-surface-800 text-surface-400 border-surface-700/50 border-r-surface-700/60 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.25)]'
                      : 'bg-surface-50 text-surface-500 border-surface-200 border-r-surface-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.06)]'
                  }`}
                  style={{ backdropFilter: 'blur(8px)' }}
                >
                  Goal
                </th>
                {displayedWeeks.flatMap((week, wi) =>
                  week.map((day, di) => (
                    <th
                      key={`dow-${wi}-${di}`}
                      className={`px-0 py-1 text-center border-b ${
                        day.isToday
                          ? 'today-cell-header bg-primary-500/10 border-primary-500/40'
                          : day.dayOfWeek === 'Sun' || day.dayOfWeek === 'Sat'
                            ? (theme === 'dark' ? 'text-surface-400 bg-surface-800/60 border-surface-700/50' : 'text-surface-400 bg-surface-100/50 border-surface-200')
                            : (theme === 'dark' ? 'text-surface-300 bg-surface-800/90 border-surface-700/50' : 'text-surface-600 bg-surface-50/90 border-surface-200')
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className={`text-[9px] uppercase font-semibold leading-none ${
                          day.isToday ? 'text-primary-600 font-bold' : 'text-surface-400'
                        }`}>
                          {day.dayOfWeek}
                        </span>
                        <span className={`text-[11px] font-bold tabular-nums w-5 h-5 flex items-center justify-center rounded-full leading-none transition-transform ${
                          day.isToday
                            ? 'bg-primary-500 text-white font-black shadow-xs scale-105'
                            : 'text-surface-700'
                        }`}>
                          {day.dayNumber}
                        </span>
                      </div>
                    </th>
                  ))
                )}
              </tr>
            </thead>

            <tbody>
              {habits.map((habit, hi) => {
                const completedDays = getHabitCompletedDays(data, habit.id, selectedYear, selectedMonth);
                const goalPct = Math.min(100, Math.round((completedDays / habit.monthlyGoal) * 100));
                const isEditing = editingId === habit.id;
                const isDragging = draggedId === habit.id;
                const isDragOver = dragOverId === habit.id && draggedId !== habit.id;

                return (
                  <tr
                    key={habit.id}
                    draggable={!isEditing}
                    onDragStart={e => handleDragStart(e, habit.id)}
                    onDragEnd={handleDragEnd}
                    onDragEnter={e => handleDragEnter(e, habit.id)}
                    onDragLeave={handleDragLeave}
                    onDragOver={e => handleDragOver(e, habit.id)}
                    onDrop={e => handleDrop(e, habit.id)}
                    className={`group transition-all duration-150 ${
                      isDragging
                        ? 'opacity-40'
                        : hi % 2 === 0 ? 'bg-white/40' : 'bg-surface-50/40'
                    } ${!isDragging ? 'hover:bg-primary-50/40' : ''} ${
                      isDragOver
                        ? dropPosition === 'above' ? 'drop-indicator-above' : 'drop-indicator-below'
                        : ''
                    }`}
                  >
                    {/* Habit Name (Sticky left at 0px) */}
                    <td
                      className={`sticky left-0 z-10 px-2.5 sm:px-3 py-2.5 w-[240px] min-w-[240px] max-w-[240px] border-b ${
                        theme === 'dark'
                          ? (hi % 2 === 0 ? 'bg-surface-900/95 border-surface-700/40' : 'bg-surface-800/95 border-surface-700/40')
                          : (hi % 2 === 0 ? 'bg-white/95 border-surface-100' : 'bg-surface-50/95 border-surface-100')
                      }`}
                      style={{ backdropFilter: 'blur(8px)' }}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={nameInputRef}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="w-full px-2 py-0.5 rounded text-xs font-medium border border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                          />
                          <button onClick={saveEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Save">
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-surface-400 hover:bg-surface-100 rounded" title="Cancel">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/name min-w-0">
                          <div
                            className="drag-handle shrink-0 hidden sm:flex items-center justify-center w-4 h-4 rounded cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-3 h-3" />
                          </div>
                          <span className="text-base shrink-0 leading-none">{habit.emoji}</span>
                          <span
                            className="text-xs sm:text-[13px] font-semibold text-surface-900 truncate block flex-1"
                            title={habit.name}
                          >
                            {habit.name}
                          </span>
                          <div className="flex items-center gap-0.5 ml-auto opacity-100 sm:opacity-0 sm:group-hover/name:opacity-100 transition-opacity shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(habit);
                              }}
                              className="p-1 rounded text-surface-400 hover:text-surface-700 hover:bg-surface-200/60 transition-colors"
                              title="Edit habit name/goal"
                            >
                              <Pencil className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteHabit(habit);
                              }}
                              className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95 transition-all"
                              title="Delete habit"
                              aria-label={`Delete ${habit.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Goal (Sticky left at 240px) */}
                    <td
                      className={`sticky left-[240px] z-10 px-1 py-1.5 text-center w-[76px] min-w-[76px] max-w-[76px] border-b border-r-2 ${
                        theme === 'dark'
                          ? (hi % 2 === 0 ? 'bg-surface-900/95 border-surface-700/40 border-r-surface-700/60 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.25)]' : 'bg-surface-800/95 border-surface-700/40 border-r-surface-700/60 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.25)]')
                          : (hi % 2 === 0 ? 'bg-white/95 border-surface-100 border-r-surface-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.06)]' : 'bg-surface-50/95 border-surface-100 border-r-surface-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.06)]')
                      }`}
                      style={{ backdropFilter: 'blur(8px)' }}
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className={`text-[11px] font-bold tabular-nums leading-none ${
                          goalPct >= 100 ? 'text-emerald-600' : 'text-surface-700'
                        }`}>
                          {completedDays}/{habit.monthlyGoal}
                        </span>
                        <div className="w-10 h-1.5 rounded-full bg-surface-200/80 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              goalPct >= 100 ? 'bg-emerald-500' : 'bg-primary-500'
                            }`}
                            style={{ width: `${goalPct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Checkbox Cells */}
                    {displayedWeeks.flatMap((week, wi) =>
                      week.map((day, di) => {
                        const dateStr = day.dateString;
                        const checked = isCompleted(data, habit.id, dateStr);
                        const toggleKey = `${habit.id}-${dateStr}`;
                        const justToggled = recentlyToggled.has(toggleKey);

                        return (
                          <td
                            key={`cb-${habit.id}-${wi}-${di}`}
                            className={`px-0 py-1 text-center w-[36px] min-w-[36px] border-b ${
                              theme === 'dark'
                                ? (day.isToday ? 'bg-primary-500/10 border-surface-700/40' : 'border-surface-700/40')
                                : (day.isToday ? 'bg-primary-500/5 border-surface-100' : 'border-surface-100')
                            }`}
                          >
                            <button
                              onClick={() => handleToggle(habit.id, dateStr)}
                              className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all duration-150 mx-auto cursor-pointer hover:scale-110 active:scale-90 ${
                                checked
                                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 border-primary-500 shadow-xs'
                                  : 'border-surface-300 hover:border-primary-400 bg-white'
                              }`}
                              aria-label={`${habit.name} on day ${day.dayNumber}`}
                            >
                              {checked && (
                                <Check
                                  className={`w-3.5 h-3.5 text-white stroke-[3] ${justToggled ? 'check-animate' : ''}`}
                                />
                              )}
                            </button>
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
