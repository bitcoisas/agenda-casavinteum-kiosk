/**
 * TimeWheelPicker
 *
 * An iOS-style scroll-wheel time picker built with CSS scroll-snap.
 * Renders two independent columns — hours (00–23) and minutes (00, 05, … 55) —
 * that snap to the nearest item when the user stops scrolling.
 *
 * Props (TimeWheelPicker):
 *  - value   : selected time as "HH:MM" string.
 *  - onChange : called with the new "HH:MM" string on selection change.
 *  - isDark  : toggles between light and dark colour themes.
 *  - label   : optional label text shown above the wheels.
 *  - minTime : optional "HH:MM" — items before this time are visually
 *              disabled and skipped during scroll; used to block past times
 *              when the selected date is today.
 *
 * Internal component ScrollColumn handles a single scrollable column.
 * It uses a debounced onScroll handler (120 ms) to determine the snapped
 * selection and skips any disabled items automatically.
 */

"use client";
import { useEffect, useRef } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const ITEM_H = 48;

function snapToFive(mm: string) {
  const n = parseInt(mm, 10);
  return MINUTES.reduce((prev, cur) =>
    Math.abs(parseInt(cur) - n) < Math.abs(parseInt(prev) - n) ? cur : prev
  );
}

// Given a "HH:MM" minTime, return the effective minimum rounded up to the next 5-min slot
function effectiveMin(minTime: string): { h: number; m: number } {
  const [h, m] = minTime.split(":").map(Number);
  const total = Math.ceil((h * 60 + m) / 5) * 5;
  return { h: Math.floor(total / 60) % 24, m: total % 60 };
}

function ScrollColumn({
  items,
  selected,
  onSelect,
  isDark,
  disabled,
}: {
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
  isDark: boolean;
  disabled?: Set<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const programmatic = useRef(false);

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0 && ref.current) {
      programmatic.current = true;
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
      setTimeout(() => { programmatic.current = false; }, 600);
    }
  }, [selected, items]);

  function handleScroll() {
    if (programmatic.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!ref.current) return;
      let idx = Math.round(ref.current.scrollTop / ITEM_H);
      idx = Math.max(0, Math.min(idx, items.length - 1));
      // Skip past disabled items
      while (idx < items.length - 1 && disabled?.has(items[idx])) idx++;
      if (items[idx] !== selected) onSelect(items[idx]);
    }, 120);
  }

  const d = isDark;

  return (
    <div className="relative flex-1">
      <div
        className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-xl pointer-events-none ${d ? "bg-zinc-700" : "bg-stone-100"}`}
        style={{ height: ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="overflow-y-scroll snap-y snap-mandatory relative"
        style={{ height: ITEM_H * 5, scrollbarWidth: "none" }}
      >
        <div style={{ height: ITEM_H * 2 }} />
        {items.map((item) => {
          const isDisabled = disabled?.has(item);
          return (
            <div
              key={item}
              onClick={() => !isDisabled && onSelect(item)}
              className={`snap-center flex items-center justify-center text-2xl select-none transition-all
                ${isDisabled
                  ? "opacity-25 cursor-not-allowed"
                  : "cursor-pointer"
                }
                ${!isDisabled && item === selected
                  ? d ? "text-zinc-100 font-semibold" : "text-gray-900 font-semibold"
                  : !isDisabled
                    ? d ? "text-zinc-600" : "text-gray-300"
                    : d ? "text-zinc-700" : "text-gray-200"
                }`}
              style={{ height: ITEM_H }}
            >
              {item}
            </div>
          );
        })}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  );
}

export function TimeWheelPicker({
  value,
  onChange,
  isDark,
  label,
  minTime,
}: {
  value: string;
  onChange: (v: string) => void;
  isDark: boolean;
  label?: string;
  minTime?: string; // "HH:MM" — items before this are disabled
}) {
  const parts = value ? value.split(":") : ["08", "00"];
  const hh = parts[0] || "08";
  const mm = snapToFive(parts[1] || "00");

  const min = minTime ? effectiveMin(minTime) : null;

  const disabledHours = min
    ? new Set(HOURS.filter((h) => parseInt(h) < min.h))
    : undefined;

  const disabledMinutes = min
    ? parseInt(hh) === min.h
      ? new Set(MINUTES.filter((m) => parseInt(m) < min.m))
      : parseInt(hh) < min.h
        ? new Set(MINUTES) // whole hour is past — all minutes disabled
        : undefined
    : undefined;

  // Auto-advance if current value is before minTime
  useEffect(() => {
    if (!min) return;
    const vh = parseInt(hh);
    const vm = parseInt(mm);
    if (vh < min.h || (vh === min.h && vm < min.m)) {
      const nextMm = MINUTES.find((m) => parseInt(m) >= min.m);
      if (nextMm) {
        onChange(`${String(min.h).padStart(2, "0")}:${nextMm}`);
      } else {
        onChange(`${String((min.h + 1) % 24).padStart(2, "0")}:00`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTime]);

  const d = isDark;

  return (
    <div className={`rounded-2xl overflow-hidden ${d ? "bg-zinc-800" : "bg-white border border-stone-200"}`}>
      {label && (
        <div className={`px-4 pt-3 pb-1 text-xs font-medium ${d ? "text-zinc-400" : "text-gray-500"}`}>
          {label}
        </div>
      )}
      <div className="flex items-center px-4 pb-3 pt-1 gap-1">
        <ScrollColumn
          items={HOURS}
          selected={hh}
          onSelect={(h) => onChange(`${h}:${mm}`)}
          isDark={isDark}
          disabled={disabledHours}
        />
        <span className={`text-3xl font-light pb-1 ${d ? "text-zinc-500" : "text-gray-300"}`}>:</span>
        <ScrollColumn
          items={MINUTES}
          selected={mm}
          onSelect={(m) => onChange(`${hh}:${m}`)}
          isDark={isDark}
          disabled={disabledMinutes}
        />
      </div>
    </div>
  );
}
