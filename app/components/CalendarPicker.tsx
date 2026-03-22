/**
 * CalendarPicker
 *
 * A custom inline calendar component that renders a month grid, allows the
 * user to navigate between months, and highlights the selected date.
 *
 * Props:
 *  - value   : selected date as "YYYY-MM-DD" string (empty string = no selection).
 *  - min     : earliest selectable date as "YYYY-MM-DD" (past dates are greyed out).
 *  - onChange : called with the new "YYYY-MM-DD" string when a day is clicked.
 *  - isDark  : toggles between the light and dark colour themes.
 *
 * No external date library is required — only React.
 */

"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
// Single-letter day-of-week headers (Sunday first, matching Brazilian calendars)
const DAYS = ["D","S","T","Q","Q","S","S"];

export function CalendarPicker({
  value,
  min,
  onChange,
  isDark,
}: {
  value: string;   // "YYYY-MM-DD"
  min?: string;    // "YYYY-MM-DD" — dates before this are disabled
  onChange: (v: string) => void;
  isDark: boolean;
}) {
  const today = new Date();
  const initial = value ? new Date(value + "T12:00") : today;
  const [view, setView] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });

  // Parse min as a LOCAL midnight date to avoid UTC off-by-one on UTC-3 timezone.
  const minDate = min
    ? (() => { const [y, m, d] = min.split("-").map(Number); return new Date(y, m - 1, d); })()
    : null;

  const firstDow = new Date(view.year, view.month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  // Build cell array: leading nulls for the day-of-week offset, then day numbers.
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function isPast(day: number) {
    if (!minDate) return false;
    return new Date(view.year, view.month, day) < minDate;
  }
  function isSelected(day: number) {
    if (!value) return false;
    const [y, m, d] = value.split("-").map(Number);
    return y === view.year && m - 1 === view.month && d === day;
  }
  function isToday(day: number) {
    return (
      today.getFullYear() === view.year &&
      today.getMonth() === view.month &&
      today.getDate() === day
    );
  }

  function prevMonth() {
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }
    );
  }
  function nextMonth() {
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }
    );
  }
  function select(day: number) {
    onChange(
      `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }

  // Disable back-navigation if going further back would only show past months.
  const canGoPrev =
    !minDate || new Date(view.year, view.month, 0) >= minDate;

  const d = isDark;

  return (
    <div className={`rounded-2xl p-4 select-none ${d ? "bg-zinc-800" : "bg-white border border-stone-200"}`}>
      {/* Month / year navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          className={`p-1.5 rounded-lg cursor-pointer disabled:opacity-30 transition-colors ${d ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-stone-100 text-gray-600"}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className={`text-sm font-semibold ${d ? "text-zinc-100" : "text-gray-900"}`}>
          {MONTHS[view.month]} {view.year}
        </span>
        <button
          onClick={nextMonth}
          className={`p-1.5 rounded-lg cursor-pointer transition-colors ${d ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-stone-100 text-gray-600"}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week header row */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((label, i) => (
          <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const past = isPast(day);
          const sel = isSelected(day);
          const tod = isToday(day);
          return (
            <button
              key={i}
              disabled={past}
              onClick={() => select(day)}
              className={`
                h-9 w-9 mx-auto rounded-full text-sm transition-colors cursor-pointer
                ${past ? "text-gray-300 dark:text-zinc-700 cursor-not-allowed" : ""}
                ${sel ? "bg-green-700 text-white font-semibold" : ""}
                ${tod && !sel ? (d ? "text-green-400 font-bold" : "text-green-700 font-bold") : ""}
                ${!sel && !past ? (d ? "hover:bg-zinc-700 text-zinc-200" : "hover:bg-stone-100 text-gray-800") : ""}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
