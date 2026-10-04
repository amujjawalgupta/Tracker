import { useState, useCallback, useEffect, useRef } from 'react';
import type { TrackerData, Habit, Theme, QuickNote, RoutineItem } from './types';
import {
  loadDataAsync,
  saveDataAsync,
  addHabit,
  updateHabit,
  deleteHabit,
  reorderHabits,
  toggleEntry,
  getDaysInMonth,
  formatDateKey,
  exportData,
  importData,
  loadNotesAsync,
  loadRoutineAsync,
  saveNotesAsync,
  saveRoutineAsync,
} from './storage';
import {
  getBackendStatus,
  saveGoogleScriptUrl,
  clearGoogleScriptUrl,
  getSavedSheetUrl,
  getActiveScriptUrl,
  fetchAllData,
  syncFullData,
  syncNotes,
  deleteHabitFromBackend,
  type BackendStatus,
} from './api';
import { TopAnalytics } from './TopAnalytics';
import { HabitGrid } from './HabitGrid';
import { RightSidebar } from './RightSidebar';
import { LiveClock } from './LiveClock';
import { RoutineManager } from './RoutineManager';
import {
  Download,
  Upload,
  Plus,
  Target,
  ChevronLeft,
  ChevronRight,
  Loader2,
  StickyNote,
  Clock,
  BarChart3,
  Sheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Settings,
  X,
  Trash2,
  Copy,
  Check,
  Code2,
  FileCode,
} from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE } from './googleAppsScriptContent';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const EMOJI_OPTIONS = ['⏰', '🏋️', '📖', '🧘', '🥗', '💰', '📵', '📝', '🚿', '🍎', '🎯', '💤', '🏃', '🎨', '🎵', '💊', '🧹', '🚰', '🌱', '🔥'];

export function HabitTracker() {
  const [data, setData] = useState<TrackerData | null>(null);
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [routine, setRoutine] = useState<RoutineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<'tracker' | 'routine'>(() => {
    return window.location.hash === '#routine' ? 'routine' : 'tracker';
  });
  const theme: Theme = 'light';
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [showAddModal, setShowAddModal] = useState(false);
  const [habitToDelete, setHabitToDelete] = useState<Habit | null>(null);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitEmoji, setNewHabitEmoji] = useState('🎯');
  const [newHabitGoal, setNewHabitGoal] = useState(25);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedRef = useRef(false);

  // Live real-time syncing state
  const [lastLiveSyncTime, setLastLiveSyncTime] = useState<Date | null>(null);

  // Google Sheets backend connection state
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [inputScriptUrl, setInputScriptUrl] = useState(() => getSavedSheetUrl() || getActiveScriptUrl());
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Mobile-specific state
  const [mobileTab, setMobileTab] = useState<'tracker' | 'notes' | 'routine'>('tracker');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // Poll backend status periodically
  const refreshBackendStatus = useCallback(async () => {
    try {
      const status = await getBackendStatus();
      setBackendStatus(status);
    } catch {
      // Backend status error
    }
  }, []);

  // Timestamp of last user-initiated action (prevents background polling from overwriting unsynced actions)
  const lastUserMutationRef = useRef<number>(0);

  // Live polling: automatically fetches real-time updates from Google Sheets
  const pollLiveUpdates = useCallback(async () => {
    // If user interacted locally within the last 4 seconds, skip background polling to prevent overwriting local state with stale sheet data
    if (Date.now() - lastUserMutationRef.current < 4000) {
      return;
    }

    try {
      const { data: freshData, notes: freshNotes, routine: freshRoutine } = await fetchAllData(true);
      
      // Double check after fetch roundtrip that user didn't perform an action while request was in-flight
      if (Date.now() - lastUserMutationRef.current < 4000) {
        return;
      }

      // Update habits/entries if changed in Google Sheets
      setData(prev => {
        if (!prev) return freshData;
        if (JSON.stringify(prev) !== JSON.stringify(freshData)) {
          dataRef.current = freshData;
          return freshData;
        }
        return prev;
      });

      // Update notes if changed in Google Sheets
      setNotes(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(freshNotes)) {
          return freshNotes;
        }
        return prev;
      });

      // Update routine if changed in Google Sheets
      setRoutine(prev => {
        if (freshRoutine.length > 0 && JSON.stringify(prev) !== JSON.stringify(freshRoutine)) {
          return freshRoutine;
        }
        return prev;
      });

      setLastLiveSyncTime(new Date());
    } catch {
      // Silently handle transient network hiccup
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    fetchAllData(true)
      .then(({ data: initialData, notes: initialNotes, routine: initialRoutine }) => {
        if (!cancelled) {
          if (initialData.habits.length > 0) {
            setData(initialData);
            dataRef.current = initialData;
          } else {
            loadDataAsync().then(loaded => {
              if (!cancelled) {
                setData(loaded);
                dataRef.current = loaded;
              }
            });
          }
          setNotes(initialNotes);
          setRoutine(initialRoutine);
          hasLoadedRef.current = true;
          setIsLoading(false);
          setLastLiveSyncTime(new Date());
        }
      })
      .catch(() => {
        loadDataAsync().then(loaded => {
          if (!cancelled) {
            setData(loaded);
            dataRef.current = loaded;
            hasLoadedRef.current = true;
            setIsLoading(false);
          }
        });
      });

    refreshBackendStatus();
    const statusInterval = setInterval(refreshBackendStatus, 8000);
    return () => {
      cancelled = true;
      clearInterval(statusInterval);
    };
  }, [refreshBackendStatus]);

  // Real-time live polling every 3.5 seconds + on window focus
  useEffect(() => {
    const liveInterval = setInterval(pollLiveUpdates, 3500);
    const handleFocus = () => pollLiveUpdates();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(liveInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [pollLiveUpdates]);

  // Sync currentPage with URL hash for browser history
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(window.location.hash === '#routine' ? 'routine' : 'tracker');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Ref to track latest data
  const dataRef = useRef<TrackerData | null>(null);

  // Helper: update data and immediately sync to Google Sheets backend
  const updateAndSave = useCallback((updater: (prev: TrackerData) => TrackerData) => {
    lastUserMutationRef.current = Date.now();
    setData(prev => {
      if (!prev) return prev;
      const next = updater(prev);
      dataRef.current = next;
      return next;
    });
    // Trigger real-time save to Google Sheets backend
    setTimeout(() => {
      if (dataRef.current) {
        saveDataAsync(dataRef.current);
      }
      refreshBackendStatus();
    }, 0);
  }, [refreshBackendStatus]);

  const handleNotesChange = useCallback((updatedNotes: QuickNote[]) => {
    lastUserMutationRef.current = Date.now();
    setNotes(updatedNotes);
    syncNotes(updatedNotes);
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (showMobileSidebar) {
      document.body.classList.add('sheet-open');
    } else {
      document.body.classList.remove('sheet-open');
    }
    return () => document.body.classList.remove('sheet-open');
  }, [showMobileSidebar]);

  // Days for selected month
  const days = getDaysInMonth(selectedYear, selectedMonth);
  const today = formatDateKey(now);

  const handleToggle = useCallback((habitId: string, date: string) => {
    updateAndSave(prev => toggleEntry(prev, habitId, date));
  }, [updateAndSave]);

  const handleAddHabit = useCallback(() => {
    if (!newHabitName.trim()) return;
    updateAndSave(prev => addHabit(prev, newHabitName.trim(), newHabitEmoji, newHabitGoal));
    setNewHabitName('');
    setNewHabitEmoji('🎯');
    setNewHabitGoal(25);
    setShowAddModal(false);
  }, [newHabitName, newHabitEmoji, newHabitGoal, updateAndSave]);

  const handleUpdateHabit = useCallback((id: string, updates: { name?: string; emoji?: string; monthlyGoal?: number }) => {
    updateAndSave(prev => updateHabit(prev, id, updates));
  }, [updateAndSave]);

  // Real-time habit deletion: updates UI instantly and immediately pushes delete to Google Sheets
  const handleDeleteHabit = useCallback(async (id: string) => {
    lastUserMutationRef.current = Date.now();
    // 1. Immediately delete from local React state
    setData(prev => {
      if (!prev) return prev;
      const next = deleteHabit(prev, id);
      dataRef.current = next;
      return next;
    });

    // 2. Immediately call backend DELETE and push to Google Sheets in real time
    try {
      await deleteHabitFromBackend(id, dataRef.current || undefined);
    } catch {
      if (dataRef.current) {
        await saveDataAsync(dataRef.current);
      }
    }
    refreshBackendStatus();
  }, [refreshBackendStatus]);

  const handleReorderHabits = useCallback((orderedIds: string[]) => {
    updateAndSave(prev => reorderHabits(prev, orderedIds));
  }, [updateAndSave]);

  const handleSaveScriptUrl = async () => {
    const url = inputScriptUrl.trim();
    if (!url) return;
    setIsSavingUrl(true);
    setSaveSuccessMsg('');

    try {
      // 1. Save URL in local storage & notify backend
      await saveGoogleScriptUrl(url);

      // 2. Fetch data from this newly connected sheet
      let sheetResult;
      try {
        sheetResult = await fetchAllData(true);
      } catch (err) {
        console.warn('Direct fetch attempt warning:', err);
      }

      // 3. Check if sheet already has habits or is empty
      if (sheetResult && sheetResult.data && sheetResult.data.habits && sheetResult.data.habits.length > 0) {
        // Sheet has existing habits! Load and show them immediately!
        setData(sheetResult.data);
        dataRef.current = sheetResult.data;
        await saveDataAsync(sheetResult.data);

        if (sheetResult.notes && sheetResult.notes.length > 0) {
          setNotes(sheetResult.notes);
          await saveNotesAsync(sheetResult.notes);
        }
        if (sheetResult.routine && sheetResult.routine.length > 0) {
          setRoutine(sheetResult.routine);
          await saveRoutineAsync(sheetResult.routine);
        }

        setSaveSuccessMsg(`Connected! Loaded ${sheetResult.data.habits.length} habits and sync is now live.`);
      } else {
        // Brand new or empty sheet! Create all current habits, notes, and routine in it!
        if (dataRef.current) {
          await syncFullData(dataRef.current, notes, routine);
        }
        setSaveSuccessMsg('Connected! Created and initialized all habits & routine in your new Google Sheet.');
      }

      await refreshBackendStatus();
      setLastLiveSyncTime(new Date());

      setTimeout(() => {
        setSaveSuccessMsg('');
        setShowSheetsModal(false);
      }, 2000);
    } catch (err) {
      console.error('Error saving Google Script URL:', err);
      alert('Could not connect to this Google Sheet URL. Please ensure your script is deployed as a Web App with access set to "Anyone".');
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleClearScriptUrl = async () => {
    if (!window.confirm('Are you sure you want to disconnect this Google Sheet? This will remove the link from your browser storage and stop live syncing with this sheet.')) {
      return;
    }
    setIsSavingUrl(true);
    try {
      await clearGoogleScriptUrl();
      setInputScriptUrl('');
      await refreshBackendStatus();
      setSaveSuccessMsg('Google Sheet disconnected and cleared from storage.');
      setTimeout(() => setSaveSuccessMsg(''), 2500);
    } catch (err) {
      console.error('Error clearing Google Script URL:', err);
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleCopyScript = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = GOOGLE_APPS_SCRIPT_CODE;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 3000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const currentNotes = await loadNotesAsync();
    const currentRoutine = await loadRoutineAsync();
    const json = exportData(data, currentNotes, currentRoutine);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-tracker-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, selectedYear, selectedMonth]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = importData(reader.result as string);
      if (result) {
        const { notes: impNotes, routine: impRoutine, ...trackerData } = result;
        setData(trackerData);
        await saveDataAsync(trackerData);
        if (impNotes) {
          setNotes(impNotes);
          await saveNotesAsync(impNotes);
        }
        if (impRoutine) {
          setRoutine(impRoutine);
          await saveRoutineAsync(impRoutine);
        }
        window.location.reload();
      } else {
        alert('Invalid file format. Please select a valid habit tracker JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const prevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const goToCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
  };

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  // Loading state
  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-primary-50/30 to-surface-100 text-surface-900">
        <div className="flex flex-col items-center gap-4 fade-in">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-xl shadow-primary-500/30">
            <Target className="w-7 h-7 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          <p className="text-sm font-medium text-surface-500">Connecting & fetching live habits from Google Sheets...</p>
        </div>
      </div>
    );
  }

  const sortedHabits = [...data.habits].sort((a, b) => a.order - b.order);

  // ─── Routine Manager Page ────────────────────────────────────
  if (currentPage === 'routine') {
    return <RoutineManager onBack={() => window.location.hash = 'tracker'} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-primary-50/30 to-surface-100 text-surface-900">
      {/* ─── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/70 border-surface-200/60">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/25">
              <Target className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold leading-tight tracking-tight text-surface-800">
                Habit Tracker
              </h1>
              <p className="text-xs text-surface-500">
                Daily Goals & Progress
              </p>
            </div>
          </div>

          {/* Center: Month Navigation + Clock + Google Sheets Live Sync Badge */}
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={prevMonth}
                className="p-1.5 sm:p-2 rounded-lg transition-all hover:scale-105 active:scale-95 hover:bg-surface-100 text-surface-600"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                onClick={goToCurrentMonth}
                className={`px-3 sm:px-4 py-1.5 rounded-xl font-semibold text-sm sm:text-base transition-all hover:scale-105 min-w-[120px] sm:min-w-[200px] ${
                  isCurrentMonth
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25'
                    : 'bg-white text-surface-700 shadow-sm hover:shadow-md'
                }`}
              >
                <span className="sm:hidden">{MONTH_SHORT[selectedMonth]} {selectedYear}</span>
                <span className="hidden sm:inline">{MONTH_NAMES[selectedMonth]} {selectedYear}</span>
              </button>

              <button
                onClick={nextMonth}
                className="p-1.5 sm:p-2 rounded-lg transition-all hover:scale-105 active:scale-95 hover:bg-surface-100 text-surface-600"
                aria-label="Next month"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="hidden md:block">
              <LiveClock />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium text-sm shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Habit</span>
            </button>

            <button
              onClick={handleExport}
              className="hidden sm:flex p-2 rounded-xl transition-all hover:scale-105 active:scale-95 hover:bg-surface-100 text-surface-600"
              title="Export data"
            >
              <Download className="w-4.5 h-4.5" />
            </button>

            <button
              onClick={handleImport}
              className="hidden sm:flex p-2 rounded-xl transition-all hover:scale-105 active:scale-95 hover:bg-surface-100 text-surface-600"
              title="Import data"
            >
              <Upload className="w-4.5 h-4.5" />
            </button>

            {/* Google Sheets Sync Button */}
            <button
              onClick={() => {
                setInputScriptUrl(getActiveScriptUrl());
                setShowSheetsModal(true);
              }}
              className={`rounded-xl border transition-colors cursor-pointer flex items-center justify-center ${
                backendStatus?.configured
                  ? 'p-2 bg-emerald-50/90 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/90 shadow-xs'
                  : 'px-2.5 py-1.5 bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100 text-xs font-semibold gap-1.5'
              }`}
              title={backendStatus?.configured ? 'Google Sheets Connected (Live Sync)' : 'Connect Google Sheet'}
            >
              <Sheet className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
              {!backendStatus?.configured && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                  <span className="hidden sm:inline">Connect Sheet</span>
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </header>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <main className="max-w-[1920px] mx-auto px-2 sm:px-6 py-3 sm:py-6 pb-28 md:pb-6">
        <div className="flex gap-5 items-start">
          {/* Left: Tracker Content */}
          <div className="flex-1 min-w-0 space-y-4 sm:space-y-6">
            <TopAnalytics
              data={data}
              days={days}
              today={today}
              theme={theme}
            />

            <HabitGrid
              data={data}
              habits={sortedHabits}
              days={days}
              today={today}
              theme={theme}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onToggle={handleToggle}
              onUpdateHabit={handleUpdateHabit}
              onDeleteHabit={habit => setHabitToDelete(habit)}
              onReorderHabits={handleReorderHabits}
            />
          </div>

          {/* Right: Desktop Sidebar (Synchronized Live) */}
          <RightSidebar
            onOpenRoutineManager={() => window.location.hash = 'routine'}
            notes={notes}
            routine={routine}
            onNotesChange={handleNotesChange}
          />
        </div>
      </main>

      {/* ─── Mobile Bottom Navigation ─────────────────────────── */}
      <nav className="mobile-bottom-nav md:hidden">
        <div className="flex items-center justify-around px-2 py-1.5">
          <button
            onClick={() => {
              setMobileTab('tracker');
              setShowMobileSidebar(false);
            }}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
              mobileTab === 'tracker' && !showMobileSidebar
                ? 'text-primary-600 font-bold'
                : 'text-surface-400'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Tracker</span>
          </button>

          <button
            onClick={() => {
              if (showMobileSidebar && mobileTab === 'notes') {
                setShowMobileSidebar(false);
                setMobileTab('tracker');
              } else {
                setMobileTab('notes');
                setShowMobileSidebar(true);
              }
            }}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
              showMobileSidebar && mobileTab === 'notes'
                ? 'text-primary-600 font-bold'
                : 'text-surface-400'
            }`}
          >
            <StickyNote className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Notes</span>
          </button>

          <button
            onClick={() => {
              setShowMobileSidebar(false);
              setMobileTab('routine');
              window.location.hash = 'routine';
            }}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
              mobileTab === 'routine'
                ? 'text-primary-600 font-bold'
                : 'text-surface-400'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Routine</span>
          </button>

          <button
            onClick={() => {
              setShowMobileSidebar(false);
              setShowSheetsModal(true);
            }}
            className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all text-surface-400 hover:text-emerald-600"
          >
            <Sheet className="w-5 h-5 text-emerald-600" />
            <span className="text-[10px] font-semibold">Sheets</span>
          </button>
        </div>
      </nav>

      {/* ─── Mobile Sidebar Sheet ─────────────────────────────── */}
      {showMobileSidebar && (
        <>
          <div
            className="fixed inset-0 z-[89] bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => {
              setShowMobileSidebar(false);
              setMobileTab('tracker');
            }}
          />
          <div className="mobile-sheet slide-up md:hidden z-[95] px-4 pt-2">
            <div className="mobile-sheet-handle" />
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-200">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-primary-500" />
                <h3 className="text-sm font-bold text-surface-800">Quick Notes & Routine</h3>
              </div>
              <button
                onClick={() => {
                  setShowMobileSidebar(false);
                  setMobileTab('tracker');
                }}
                className="p-1 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
                aria-label="Close notes"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="pb-8">
              <RightSidebar
                onOpenRoutineManager={() => {
                  setShowMobileSidebar(false);
                  setMobileTab('routine');
                  window.location.hash = 'routine';
                }}
                notes={notes}
                routine={routine}
                onNotesChange={handleNotesChange}
              />
            </div>
          </div>
        </>
      )}

      {/* ─── Google Sheets Live Sync Modal ────────────────────── */}
      {showSheetsModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowSheetsModal(false)}
          />
          <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl slide-up sm:fade-in bg-white border border-surface-200 max-h-[90vh] overflow-y-auto">
            <div className="mobile-sheet-handle sm:hidden" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600">
                  <Sheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-surface-800 leading-tight">
                    Google Sheets Live Bidirectional Sync
                  </h2>
                  <p className="text-xs text-surface-500">
                    Changes in Google Sheets reflect here live, and changes here save to your sheet in real time.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSheetsModal(false)}
                className="p-1 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Status Box */}
            <div className={`p-4 rounded-xl border mb-5 ${
              backendStatus?.configured && getActiveScriptUrl()
                ? 'bg-emerald-50/90 border-emerald-200'
                : 'bg-amber-50/90 border-amber-200'
            }`}>
              <div className="flex items-start gap-3">
                {backendStatus?.configured && getActiveScriptUrl() ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-1.5 flex-1 min-w-0">
                  <div className="font-bold text-surface-800 text-sm">
                    {backendStatus?.configured && getActiveScriptUrl()
                      ? 'Connected & Live Syncing with Google Sheets'
                      : 'Not connected to Google Sheets yet'}
                  </div>
                  {backendStatus?.configured && getActiveScriptUrl() ? (
                    <>
                      <div className="text-surface-600 space-y-0.5">
                        <p className="truncate font-mono text-[11px] bg-white/70 px-2 py-1 rounded border border-emerald-200 text-emerald-950" title={getActiveScriptUrl()}>
                          <strong>Active URL:</strong> {getActiveScriptUrl()}
                        </p>
                        <p>
                          <strong>Last Live Fetch:</strong> {lastLiveSyncTime ? lastLiveSyncTime.toLocaleTimeString() : 'Just now'}
                        </p>
                        <p>
                          <strong>Live Records:</strong> {data?.habits.length || 0} habits, {data?.entries.length || 0} completed entries, {notes.length} notes, {routine.length} routine items
                        </p>
                      </div>
                      <div className="pt-2.5 mt-2 border-t border-emerald-200/80 flex items-center justify-between">
                        <span className="text-[11px] text-surface-500 font-medium">Want to remove or switch sheet?</span>
                        <button
                          type="button"
                          onClick={handleClearScriptUrl}
                          disabled={isSavingUrl}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold border border-red-200 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          Disconnect & Clear Sheet
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-surface-600 leading-relaxed">
                      Enter your Google Apps Script Web App URL below. It will be <strong>saved in your browser's local storage</strong> so you never have to enter it again. If you connect a new sheet, all habits and routines will be created automatically!
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Quick 3-Step Setup Instructions */}
            <div className="space-y-3 mb-5 text-xs text-surface-700 bg-surface-50 p-4 rounded-xl border border-surface-200">
              <div className="font-bold text-sm text-surface-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-primary-600" />
                  Quick Setup (1 Minute):
                </span>
                <button
                  type="button"
                  onClick={() => setShowScriptModal(true)}
                  className="text-xs text-primary-600 hover:text-primary-700 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  View &amp; Copy Code
                </button>
              </div>
              <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
                <li>
                  Open your Google Sheet (or create a new blank one at{' '}
                  <a
                    href="https://sheets.new"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 font-semibold underline inline-flex items-center gap-0.5"
                  >
                    sheets.new <ExternalLink className="w-3 h-3" />
                  </a>
                  ).
                </li>
                <li>
                  Go to <strong>Extensions &gt; Apps Script</strong>, delete any code, and paste{' '}
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyScript();
                      setShowScriptModal(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] rounded border border-emerald-300 transition-all hover:scale-105 active:scale-95 cursor-pointer group shadow-2xs"
                    title="Tap to copy script code & view instructions"
                  >
                    <FileCode className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
                    <span className="underline decoration-emerald-400 underline-offset-2">google-apps-script.js</span>
                    <span className="text-[10px] font-sans bg-emerald-600 text-white font-semibold px-1.5 py-0.2 rounded ml-0.5">
                      Tap to Copy
                    </span>
                  </button>{' '}
                  and save.
                </li>
                <li>
                  Click <strong>Deploy &gt; New deployment &gt; Web app</strong>. Set <em>Who has access</em> to <strong>Anyone</strong>, click Deploy, and copy the Web App URL.
                </li>
              </ol>

              {/* Direct 1-Click Copy & View Banner */}
              <div className="pt-2 border-t border-surface-200/80 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className={`flex-1 py-2 px-3 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs ${
                    copiedScript
                      ? 'bg-emerald-600 text-white scale-[1.01]'
                      : 'bg-primary-600 hover:bg-primary-700 text-white hover:scale-[1.01]'
                  }`}
                >
                  {copiedScript ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Copied Script to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-white" />
                      <span>Copy Entire google-apps-script.js</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowScriptModal(true)}
                  className="py-2 px-3 rounded-lg border border-surface-300 bg-white hover:bg-surface-100 text-surface-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors shrink-0"
                >
                  <Code2 className="w-3.5 h-3.5 text-surface-500" />
                  <span>View Code</span>
                </button>
              </div>
            </div>

            {/* Paste Script URL */}
            <div className="space-y-2 mb-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-surface-700">
                {backendStatus?.configured && getActiveScriptUrl() ? 'Change / Update Google Apps Script URL' : 'Google Apps Script Web App URL'}
              </label>
              <input
                type="url"
                value={inputScriptUrl}
                onChange={e => setInputScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40 bg-surface-50 border-surface-200 text-surface-900 placeholder:text-surface-400"
              />
              <p className="text-[11px] text-surface-500 leading-relaxed">
                💾 <strong>Saved in Local Storage:</strong> You only need to paste this once. It is saved in your browser so you don't have to enter it again and again.
              </p>
            </div>

            {saveSuccessMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2 shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowSheetsModal(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all bg-surface-100 hover:bg-surface-200 text-surface-600"
              >
                Close
              </button>
              <button
                onClick={handleSaveScriptUrl}
                disabled={!inputScriptUrl.trim() || isSavingUrl}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSavingUrl ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Connecting & Syncing...
                  </>
                ) : (
                  'Connect & Sync Now'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Google Apps Script Code & Instructions Modal ─────── */}
      {showScriptModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setShowScriptModal(false)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-surface-200 overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-surface-200 flex items-center justify-between bg-surface-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-surface-900 flex items-center gap-2">
                    google-apps-script.js
                    <span className="text-[11px] font-medium font-mono px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                      246 lines
                    </span>
                  </h3>
                  <p className="text-xs text-surface-500">
                    Copy and paste this into Google Sheets Apps Script editor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-700 hover:bg-surface-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Step-by-step pasting instructions */}
              <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-3.5 text-xs text-emerald-950 space-y-2">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5 text-[13px]">
                  <span>📋</span> How to Paste &amp; Set Up in Google Sheets (Takes 1 min):
                </div>
                <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed text-surface-700">
                  <li>
                    Open your Google Sheet (or create one at{' '}
                    <a
                      href="https://sheets.new"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-700 font-semibold underline inline-flex items-center gap-0.5"
                    >
                      sheets.new <ExternalLink className="w-3 h-3" />
                    </a>
                    ).
                  </li>
                  <li>
                    In the top menu, click <strong>Extensions &gt; Apps Script</strong>.
                  </li>
                  <li>
                    Select all default code in <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono">Code.gs</code> (Ctrl+A / Cmd+A) and delete it.
                  </li>
                  <li>
                    Click the <strong>"Copy Entire Code"</strong> button below, and paste it (<kbd className="px-1 py-0.5 bg-surface-200 rounded border border-surface-300 font-mono">Ctrl+V</kbd> or <kbd className="px-1 py-0.5 bg-surface-200 rounded border border-surface-300 font-mono">Cmd+V</kbd>).
                  </li>
                  <li>
                    Click the <strong>Save</strong> disk icon (or Ctrl+S).
                  </li>
                  <li>
                    Click <strong>Deploy &gt; New deployment</strong>, choose <strong>Web app</strong>, set <em>Who has access</em> to <strong>Anyone</strong>, click Deploy, and copy your Web App URL into the Tracker!
                  </li>
                </ol>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                    copiedScript
                      ? 'bg-emerald-600 text-white scale-[1.01]'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-[1.01]'
                  }`}
                >
                  {copiedScript ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Copied 246 Lines to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-white" />
                      <span>Copy Entire google-apps-script.js (1-Click)</span>
                    </>
                  )}
                </button>
                <a
                  href="https://sheets.new"
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-4 rounded-xl border border-surface-300 bg-surface-50 hover:bg-surface-100 text-surface-700 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <span>Open sheets.new</span>
                  <ExternalLink className="w-3.5 h-3.5 text-surface-500" />
                </a>
              </div>

              {/* Code viewer container */}
              <div className="relative rounded-xl border border-surface-800 bg-[#0d1117] overflow-hidden shadow-inner">
                <div className="flex items-center justify-between px-3.5 py-2 bg-[#161b22] border-b border-surface-800 text-[11px] text-surface-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                    google-apps-script.js
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="inline-flex items-center gap-1 text-[11px] text-surface-300 hover:text-white px-2 py-0.5 rounded bg-surface-800 hover:bg-surface-700 transition-colors cursor-pointer"
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-surface-300" />}
                    <span>{copiedScript ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono text-emerald-300/90 leading-relaxed overflow-x-auto max-h-[340px] overflow-y-auto selection:bg-emerald-900 selection:text-white">
                  <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-surface-200 bg-surface-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="py-2 px-4 rounded-xl font-medium text-xs sm:text-sm text-surface-600 hover:bg-surface-200 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCopyScript();
                  setShowScriptModal(false);
                }}
                className="py-2 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-primary-600 hover:bg-primary-700 text-white transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Copy &amp; Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Habit Modal ──────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl slide-up sm:fade-in bg-white border border-surface-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold flex items-center gap-2 text-surface-800">
                <Plus className="w-5 h-5 text-primary-500" />
                Add New Habit
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-surface-600">
                  Habit Name
                </label>
                <input
                  type="text"
                  value={newHabitName}
                  onChange={e => setNewHabitName(e.target.value)}
                  placeholder="e.g., Morning Meditation"
                  onKeyDown={e => e.key === 'Enter' && handleAddHabit()}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40 bg-surface-50 border-surface-200 text-surface-900 placeholder:text-surface-400"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-surface-600">
                  Icon
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setNewHabitEmoji(emoji)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all hover:scale-110 ${
                        newHabitEmoji === emoji
                          ? 'bg-primary-500/20 ring-2 ring-primary-500 scale-110'
                          : 'hover:bg-surface-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-surface-600">
                  Monthly Goal (days)
                </label>
                <input
                  type="number"
                  value={newHabitGoal}
                  onChange={e => setNewHabitGoal(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={31}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40 bg-surface-50 border-surface-200 text-surface-900"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all bg-surface-100 hover:bg-surface-200 text-surface-600"
              >
                Cancel
              </button>
              <button
                onClick={handleAddHabit}
                disabled={!newHabitName.trim()}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              >
                Add Habit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Habit Confirmation Modal ─────────────────── */}
      {habitToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setHabitToDelete(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl p-5 sm:p-6 shadow-2xl bg-white border border-surface-200 slide-up sm:fade-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-800">Delete Habit?</h3>
                <p className="text-xs text-surface-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-5 leading-relaxed">
              Are you sure you want to delete <strong className="text-surface-900">{habitToDelete.emoji} {habitToDelete.name}</strong> and all its completed entries?
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setHabitToDelete(null)}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all bg-surface-100 hover:bg-surface-200 text-surface-700 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = habitToDelete.id;
                  setHabitToDelete(null);
                  await handleDeleteHabit(id);
                }}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-600/25 hover:shadow-red-600/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Delete Habit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
