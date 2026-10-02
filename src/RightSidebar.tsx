import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { QuickNote, RoutineItem } from './types';
import {
  loadNotesAsync,
  saveNotesAsync,
  loadRoutineAsync,
} from './storage';
import {
  Plus,
  Trash2,
  StickyNote,
  Clock,
  ChevronDown,
  ChevronUp,
  Settings2,
} from 'lucide-react';

interface RightSidebarProps {
  onOpenRoutineManager: () => void;
  notes?: QuickNote[];
  routine?: RoutineItem[];
  onNotesChange?: (notes: QuickNote[]) => void;
}

const NOTE_COLORS = [
  '#C4704B', // terracotta
  '#E8A882', // peach
  '#5EA86D', // green
  '#D4845A', // warm orange
  '#B05E3A', // deep terracotta
  '#8E4A2D', // brown
  '#7ABB8A', // sage
  '#6B6058', // warm gray
];

export function RightSidebar({
  onOpenRoutineManager,
  notes: propNotes,
  routine: propRoutine,
  onNotesChange,
}: RightSidebarProps) {
  // ─── Notes State ────────────────────────────────────────────
  const [internalNotes, setInternalNotes] = useState<QuickNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(true);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Routine State ──────────────────────────────────────────
  const [internalRoutine, setInternalRoutine] = useState<RoutineItem[]>([]);
  const [routineExpanded, setRoutineExpanded] = useState(true);
  const [currentMinute, setCurrentMinute] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  const notes = propNotes !== undefined ? propNotes : internalNotes;
  const routine = propRoutine !== undefined ? propRoutine : internalRoutine;

  // ─── Load Data if props not provided ────────────────────────
  useEffect(() => {
    if (propNotes === undefined) {
      loadNotesAsync().then(loaded => {
        setInternalNotes(loaded);
      });
    }
    if (propRoutine === undefined) {
      loadRoutineAsync().then(loaded => {
        setInternalRoutine(loaded);
      });
    }
  }, [propNotes, propRoutine]);

  // Update current minute every 30s for routine sorting
  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date();
      setCurrentMinute(n.getHours() * 60 + n.getMinutes());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // ─── Note Handlers ──────────────────────────────────────────
  const addNote = useCallback(() => {
    if (!newNoteText.trim()) return;
    const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
    const note: QuickNote = {
      id: crypto.randomUUID(),
      text: newNoteText.trim(),
      createdAt: new Date().toISOString(),
      color,
    };
    const updated = [note, ...notes];
    if (onNotesChange) {
      onNotesChange(updated);
    } else {
      setInternalNotes(updated);
      saveNotesAsync(updated);
    }
    setNewNoteText('');
    noteInputRef.current?.focus();
  }, [newNoteText, notes, onNotesChange]);

  const deleteNote = useCallback((id: string) => {
    const updated = notes.filter(n => n.id !== id);
    if (onNotesChange) {
      onNotesChange(updated);
    } else {
      setInternalNotes(updated);
      saveNotesAsync(updated);
    }
  }, [notes, onNotesChange]);

  // Helper to parse time strings (handles "07:00", "07:00:00", or ISO dates from Sheets)
  const parseTimeToMinutes = (timeStr: string | undefined | null): number => {
    if (!timeStr) return 0;
    if (typeof timeStr === 'string' && timeStr.includes('T')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 60 + d.getMinutes();
      }
    }
    const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
    return 0;
  };

  // ─── Routine: filter for today & sort by current time ──────
  const todayRoutine = useMemo(() => {
    const today = new Date().getDay();
    const todayItems = routine.filter(item => Array.isArray(item.days) && item.days.includes(today));

    // Sort so current/upcoming items appear first
    return todayItems.sort((a, b) => {
      const aMin = parseTimeToMinutes(a.time);
      const bMin = parseTimeToMinutes(b.time);

      // Items currently happening or upcoming come first
      const aUpcoming = aMin >= currentMinute ? 0 : 1;
      const bUpcoming = bMin >= currentMinute ? 0 : 1;

      if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
      return aMin - bMin;
    });
  }, [routine, currentMinute]);

  // Format time for display (e.g. 07:00 -> 7:00 AM)
  const formatTime = (time: string | undefined | null) => {
    if (!time) return '--:--';
    if (typeof time === 'string' && time.includes('T')) {
      const d = new Date(time);
      if (!isNaN(d.getTime())) {
        const hour = d.getHours();
        const m = d.getMinutes().toString().padStart(2, '0');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${m} ${ampm}`;
      }
    }
    const match = String(time).match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const hour = parseInt(match[1], 10);
      const m = match[2];
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${displayHour}:${m} ${ampm}`;
    }
    return String(time);
  };

  // Determine if a routine item is "now"
  const isCurrentTimeSlot = (time: string, endTime: string) => {
    const startMin = parseTimeToMinutes(time);
    const endMin = parseTimeToMinutes(endTime);
    return currentMinute >= startMin && currentMinute < endMin;
  };

  const isUpcoming = (time: string) => {
    return parseTimeToMinutes(time) >= currentMinute;
  };

  return (
    <aside className="right-sidebar w-full xl:w-[340px] shrink-0 space-y-4 xl:block">
      {/* ═══════════════════════════════════════════════════════
          QUICK NOTES
          ═══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border overflow-hidden bg-white/80 border-surface-200/60 shadow-sm">
        {/* Header */}
        <button
          onClick={() => setNotesExpanded(!notesExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600">
              <StickyNote className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-surface-800">
              Quick Notes
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-200 text-surface-500">
              {notes.length}
            </span>
          </div>
          {notesExpanded
            ? <ChevronUp className="w-4 h-4 text-surface-400" />
            : <ChevronDown className="w-4 h-4 text-surface-400" />
          }
        </button>

        {notesExpanded && (
          <div className="px-4 pb-4 space-y-3 fade-in">
            {/* Add Note Input */}
            <div className="flex gap-2">
              <textarea
                ref={noteInputRef}
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addNote();
                  }
                }}
                placeholder="Jot something down..."
                rows={2}
                className="flex-1 px-3 py-2 rounded-xl border text-sm resize-none transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40 bg-surface-50 border-surface-200 text-surface-900 placeholder:text-surface-400"
              />
              <button
                onClick={addNote}
                disabled={!newNoteText.trim()}
                className="self-end p-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Notes List */}
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 sidebar-scroll">
              {notes.length === 0 && (
                <div className="text-center py-6 text-sm text-surface-400">
                  <div className="text-2xl mb-1">📝</div>
                  No notes yet
                </div>
              )}
              {notes.map(note => (
                <div
                  key={note.id}
                  className="group relative rounded-xl p-3 border-l-[3px] transition-all hover:scale-[1.01] bg-surface-50/80 hover:bg-white shadow-sm"
                  style={{ borderLeftColor: note.color }}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-surface-700">
                    {note.text}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-surface-400">
                      {new Date(note.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                      title="Delete note"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          TODAY'S ROUTINE (read-only, sorted by current time)
          ═══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border overflow-hidden bg-white/80 border-surface-200/60 shadow-sm">
        {/* Header */}
        <div
          onClick={() => setRoutineExpanded(!routineExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-50 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-500/10 text-primary-600">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-surface-800">
              Today's Routine
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-200 text-surface-500">
              {todayRoutine.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {routineExpanded && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onOpenRoutineManager();
                }}
                className="p-1 rounded-lg text-primary-600 hover:bg-primary-50 transition-all hover:scale-110 active:scale-95"
                title="Manage weekly routine"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            {routineExpanded
              ? <ChevronUp className="w-4 h-4 text-surface-400" />
              : <ChevronDown className="w-4 h-4 text-surface-400" />
            }
          </div>
        </div>

        {routineExpanded && (
          <div className="px-3 pb-3 fade-in">
            {/* Manage button */}
            <button
              onClick={onOpenRoutineManager}
              className="w-full mb-2.5 py-1.5 rounded-lg text-xs font-medium text-primary-600 bg-primary-50/80 hover:bg-primary-100 transition-all border border-primary-200/50"
            >
              ⚙️ Manage Weekly Routine
            </button>

            {/* Routine List — sorted by current time */}
            <div className="max-h-[420px] overflow-y-auto pr-0.5 sidebar-scroll space-y-1">
              {todayRoutine.length === 0 && (
                <div className="text-center py-8 text-sm text-surface-400">
                  <div className="text-2xl mb-1">📋</div>
                  Nothing scheduled today
                </div>
              )}
              {todayRoutine.map((item) => {
                const isCurrent = isCurrentTimeSlot(item.time, item.endTime);
                const upcoming = isUpcoming(item.time);

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl px-3 py-2.5 transition-all ${isCurrent
                      ? 'bg-primary-50 border border-primary-200/60 shadow-sm'
                      : upcoming
                        ? 'hover:bg-surface-50/80'
                        : 'opacity-50 hover:opacity-70'
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Time */}
                      <div className="shrink-0">
                        <div className="flex items-center gap-1">
                          {isCurrent && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse shrink-0" />
                          )}
                          <span className={`text-[11px] font-mono font-bold tabular-nums ${isCurrent ? 'text-primary-700' : 'text-surface-500'
                            }`}>
                            {formatTime(item.time)}
                          </span>
                        </div>
                      </div>

                      {/* Activity */}
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium truncate block ${isCurrent ? 'text-primary-800' : 'text-surface-700'
                          }`}>
                          {item.emoji} {item.activity}
                        </span>
                      </div>

                      {/* Status badge */}
                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded-full shrink-0">
                          Now
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
