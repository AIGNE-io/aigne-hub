import { SetStateAction, useState } from 'react';

import dayjs from '../libs/dayjs';

type DateRange = { start: dayjs.Dayjs; end: dayjs.Dayjs };

const DEFAULT_RANGE_DAYS = 6;

function readFromSession(key: string): DateRange | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { start: dayjs(parsed.start), end: dayjs(parsed.end) };
  } catch {
    return null;
  }
}

function persistToSession(key: string, range: DateRange) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(
    key,
    JSON.stringify({
      start: range.start.format('YYYY-MM-DD'),
      end: range.end.format('YYYY-MM-DD'),
    })
  );
}

/**
 * Shared hook for date range state with sessionStorage persistence.
 *
 * @param sessionKey - sessionStorage key for persisting the date range
 * @param defaultDays - number of days to subtract from today for the default start (default: 6)
 */
export function useDateRange(sessionKey: string, defaultDays = DEFAULT_RANGE_DAYS) {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    return readFromSession(sessionKey) ?? { start: dayjs().subtract(defaultDays, 'day'), end: dayjs() };
  });

  const handleDateRangeChange = (updater: SetStateAction<DateRange>) => {
    setDateRange((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistToSession(sessionKey, next);
      return next;
    });
  };

  return [dateRange, handleDateRangeChange] as const;
}
