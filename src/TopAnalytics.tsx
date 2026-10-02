import { useMemo, useState } from 'react';
import type { TrackerData, Theme, DayInfo } from './types';
import { formatDateKey, getCompletedCount } from './storage';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface TopAnalyticsProps {
  data: TrackerData;
  days: Date[];
  today: string;
  theme: Theme;
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

export function TopAnalytics({ data, days, today: _today, theme }: TopAnalyticsProps) {
  const [showFullMobileTable, setShowFullMobileTable] = useState(false);
  const totalHabits = data.habits.length;
  const todayStr = formatDateKey(new Date());

  // Compute daily stats
  const dailyStats = useMemo(() => {
    return days.map(day => {
      const dateStr = formatDateKey(day);
      const completed = getCompletedCount(data, dateStr);
      const goal = totalHabits;
      const left = Math.max(0, goal - completed);
      return { dateStr, completed, goal, left, day };
    });
  }, [data, days, totalHabits]);

  // Today specific calculations
  const todayStat = dailyStats.find(s => s.dateStr === todayStr);
  const todayCompleted = todayStat?.completed || 0;
  const todayGoal = totalHabits;
  const todayLeft = Math.max(0, todayGoal - todayCompleted);
  const todayPct = todayGoal > 0 ? Math.round((todayCompleted / todayGoal) * 100) : 0;

  // Recent 7 days for mobile chart
  const recent7Days = useMemo(() => {
    const todayIdx = dailyStats.findIndex(s => s.dateStr === todayStr);
    if (todayIdx >= 0) {
      const start = Math.max(0, todayIdx - 6);
      return dailyStats.slice(start, todayIdx + 1);
    }
    return dailyStats.slice(0, 7);
  }, [dailyStats, todayStr]);

  // Compute weekly aggregates
  const weeks = useMemo(() => groupIntoWeeks(days), [days]);

  const weeklyAggregates = useMemo(() => {
    return weeks.map(week => {
      let totalCompleted = 0;
      let totalGoal = 0;
      for (const day of week) {
        totalCompleted += getCompletedCount(data, day.dateString);
        totalGoal += totalHabits;
      }
      const pct = totalGoal > 0 ? Math.round((totalCompleted / totalGoal) * 100) : 0;
      return { totalCompleted, totalGoal, pct };
    });
  }, [weeks, data, totalHabits]);

  // Max completed for bar chart scaling
  const maxCompleted = useMemo(() => {
    return Math.max(1, ...dailyStats.map(s => s.completed));
  }, [dailyStats]);

  return (
    <div className={`rounded-2xl border overflow-hidden transition-colors ${
      theme === 'dark'
        ? 'bg-surface-900/60 border-surface-700/50'
        : 'bg-white/80 border-surface-200/60 shadow-sm'
    }`}>
      {/* ═══════════════════════════════════════════════════════
          MOBILE SUMMARY CARD (Phones only, < 640px)
          ═══════════════════════════════════════════════════════ */}
      <div className="sm:hidden p-3.5 space-y-3">
        {/* Top: Today's Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-surface-600">
              Today's Performance
            </span>
          </div>
          <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200/60">
            {todayPct}% Done
          </span>
        </div>

        {/* 3 Metric Pills */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-emerald-50/80 border border-emerald-100">
            <div className="text-base font-black text-emerald-700 tabular-nums">
              {todayCompleted}
            </div>
            <div className="text-[10px] font-bold uppercase text-emerald-600">Completed</div>
          </div>
          <div className="p-2 rounded-xl bg-surface-100 border border-surface-200/60">
            <div className="text-base font-black text-surface-800 tabular-nums">
              {todayGoal}
            </div>
            <div className="text-[10px] font-bold uppercase text-surface-500">Goal</div>
          </div>
          <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-100">
            <div className="text-base font-black text-amber-700 tabular-nums">
              {todayLeft}
            </div>
            <div className="text-[10px] font-bold uppercase text-amber-600">Left</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="w-full h-2 rounded-full bg-surface-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                todayPct >= 100
                  ? 'bg-gradient-to-r from-success-500 to-success-400'
                  : 'bg-gradient-to-r from-primary-500 to-primary-400'
              }`}
              style={{ width: `${todayPct}%` }}
            />
          </div>
        </div>

        {/* 7-Day Mini Trend Chart */}
        <div className="pt-1">
          <div className="text-[11px] font-semibold text-surface-500 mb-1.5 flex justify-between">
            <span>7-Day Consistency</span>
            <span>{recent7Days.reduce((a, s) => a + s.completed, 0)} completed</span>
          </div>
          <div className="flex items-end justify-between gap-1 h-10 px-1">
            {recent7Days.map((stat, i) => {
              const h = (stat.completed / maxCompleted) * 32;
              const isToday = stat.dateStr === todayStr;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full max-w-[18px] rounded-t-sm transition-all ${
                      stat.completed > 0
                        ? isToday
                          ? 'bg-primary-500'
                          : 'bg-primary-300'
                        : 'bg-surface-200'
                    }`}
                    style={{ height: `${Math.max(4, h)}px` }}
                  />
                  <span className={`text-[9px] font-bold tabular-nums ${isToday ? 'text-primary-600' : 'text-surface-400'}`}>
                    {stat.day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Toggle Full Month Table on Mobile */}
        <button
          onClick={() => setShowFullMobileTable(!showFullMobileTable)}
          className="w-full pt-1 text-center text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center justify-center gap-1"
        >
          <span>{showFullMobileTable ? 'Hide Monthly Table' : 'Show Full Monthly Breakdown'}</span>
          {showFullMobileTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════
          DESKTOP & EXPANDED TABLE
          ═══════════════════════════════════════════════════════ */}
      <div className={`overflow-x-auto ${showFullMobileTable ? 'block' : 'hidden sm:block'}`}>
        <table className="w-full border-collapse min-w-max">
          <thead>
            {/* ─── Bar Chart Row ──────────────────────────── */}
            <tr>
              <td className={`sticky left-0 z-10 px-3 sm:px-4 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-surface-900/95 text-surface-400'
                  : 'bg-white/95 text-surface-500'
              }`}>
                Daily Progress
              </td>
              {weeks.map((week, wi) => (
                week.map((day, di) => {
                  const stat = dailyStats.find(s => s.dateStr === day.dateString);
                  const barHeight = stat ? (stat.completed / maxCompleted) * 40 : 0;
                  return (
                    <td
                      key={`bar-${wi}-${di}`}
                      className={`px-0 pt-2 pb-1 text-center relative ${
                        day.isToday ? (theme === 'dark' ? 'bg-primary-500/10' : 'bg-primary-500/8') : ''
                      }`}
                      style={{ minWidth: 34 }}
                    >
                      <div className="flex items-end justify-center h-[44px]">
                        <div
                          className={`w-3.5 sm:w-4 rounded-t-sm bar-transition ${
                            stat && stat.completed > 0
                              ? stat.completed >= stat.goal
                                ? 'bg-gradient-to-t from-success-600 to-success-400'
                                : 'bg-gradient-to-t from-primary-600 to-primary-400'
                              : theme === 'dark'
                                ? 'bg-surface-700'
                                : 'bg-surface-200'
                          }`}
                          style={{ height: `${Math.max(barHeight, 2)}px` }}
                        />
                      </div>
                    </td>
                  );
                })
              ))}
            </tr>
          </thead>

          <tbody>
            {/* ─── COMPLETED Row ──────────────────────────── */}
            <tr className={theme === 'dark' ? 'border-t border-surface-700/40' : 'border-t border-surface-100'}>
              <td className={`sticky left-0 z-10 px-3 sm:px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-surface-900/95 text-success-400'
                  : 'bg-white/95 text-success-600'
              }`}>
                Completed
              </td>
              {weeks.map((week, wi) => (
                week.map((day, di) => {
                  const stat = dailyStats.find(s => s.dateStr === day.dateString);
                  return (
                    <td
                      key={`comp-${wi}-${di}`}
                      className={`px-0 py-1.5 text-center text-xs font-semibold tabular-nums ${
                        day.isToday
                          ? theme === 'dark' ? 'bg-primary-500/10 text-primary-300' : 'bg-primary-500/8 text-primary-700 font-bold'
                          : theme === 'dark' ? 'text-surface-300' : 'text-surface-700'
                      }`}
                    >
                      {stat?.completed || 0}
                    </td>
                  );
                })
              ))}
            </tr>

            {/* ─── GOAL Row ───────────────────────────────── */}
            <tr className={theme === 'dark' ? 'border-t border-surface-700/40' : 'border-t border-surface-100'}>
              <td className={`sticky left-0 z-10 px-3 sm:px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-surface-900/95 text-primary-400'
                  : 'bg-white/95 text-primary-600'
              }`}>
                Goal
              </td>
              {weeks.map((week, wi) => (
                week.map((day, di) => {
                  return (
                    <td
                      key={`goal-${wi}-${di}`}
                      className={`px-0 py-1.5 text-center text-xs tabular-nums ${
                        day.isToday
                          ? theme === 'dark' ? 'bg-primary-500/10 text-primary-400' : 'bg-primary-500/8 text-primary-600'
                          : theme === 'dark' ? 'text-surface-400' : 'text-surface-500'
                      }`}
                    >
                      {totalHabits}
                    </td>
                  );
                })
              ))}
            </tr>

            {/* ─── LEFT Row ───────────────────────────────── */}
            <tr className={theme === 'dark' ? 'border-t border-surface-700/40' : 'border-t border-surface-100'}>
              <td className={`sticky left-0 z-10 px-3 sm:px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-surface-900/95 text-amber-400'
                  : 'bg-white/95 text-amber-600'
              }`}>
                Left
              </td>
              {weeks.map((week, wi) => (
                week.map((day, di) => {
                  const stat = dailyStats.find(s => s.dateStr === day.dateString);
                  return (
                    <td
                      key={`left-${wi}-${di}`}
                      className={`px-0 py-1.5 text-center text-xs tabular-nums ${
                        day.isToday
                          ? theme === 'dark' ? 'bg-primary-500/10 text-amber-300' : 'bg-primary-500/8 text-amber-600 font-bold'
                          : theme === 'dark' ? 'text-surface-500' : 'text-surface-400'
                      }`}
                    >
                      {stat?.left ?? totalHabits}
                    </td>
                  );
                })
              ))}
            </tr>

            {/* ─── WEEKLY PROGRESS Row ────────────────────── */}
            <tr className={theme === 'dark' ? 'border-t border-surface-700/40' : 'border-t border-surface-100'}>
              <td className={`sticky left-0 z-10 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-surface-900/95 text-surface-300'
                  : 'bg-white/95 text-surface-600'
              }`}>
                Weekly Progress
              </td>
              {weeks.map((week, wi) => {
                const agg = weeklyAggregates[wi];
                return (
                  <td
                    key={`weekly-${wi}`}
                    colSpan={week.length}
                    className={`px-2 py-2 text-center ${
                      theme === 'dark' ? 'text-surface-300' : 'text-surface-600'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-bold tabular-nums">
                        {agg.totalCompleted}/{agg.totalGoal}
                      </span>
                      <span className={`text-[10px] font-semibold ${
                        agg.pct >= 80
                          ? 'text-success-500'
                          : agg.pct >= 50
                            ? 'text-primary-500'
                            : agg.pct > 0
                              ? 'text-amber-500'
                              : theme === 'dark' ? 'text-surface-500' : 'text-surface-400'
                      }`}>
                        {agg.pct}%
                      </span>
                      <div className={`w-full max-w-[80px] h-1.5 rounded-full overflow-hidden ${
                        theme === 'dark' ? 'bg-surface-700' : 'bg-surface-200'
                      }`}>
                        <div
                          className={`h-full rounded-full progress-animate ${
                            agg.pct >= 80
                              ? 'bg-gradient-to-r from-success-500 to-success-400'
                              : agg.pct >= 50
                                ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                                : 'bg-gradient-to-r from-amber-500 to-amber-400'
                          }`}
                          style={{ width: `${agg.pct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
