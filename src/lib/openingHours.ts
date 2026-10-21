/**
 * Utility for parsing and evaluating OpenStreetMap (OSM) opening_hours tags
 * Examples of OSM formats:
 * - "24/7"
 * - "Mo-Fr 08:00-18:00; Sa 09:00-14:00"
 * - "Tu-Su 09:30-17:00"
 * - "Mo-Sa 10:00-22:00; Su closed"
 * - "09:00-18:00"
 * - "Mo-Su 10:00-14:00,17:00-22:00"
 */

export interface OpeningHoursEvaluation {
  raw: string;
  isOpen: boolean | null; // true if within open hours, false if closed/outside, null if unparseable/variable
  warning: string | null;
  todayHoursText: string;
  is24_7: boolean;
}

const DAY_ABBRS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function parseTimeToMins(str: string): number | null {
  if (!str) return null;
  const cleaned = str.trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function formatMins(m: number): string {
  const norm = ((m % 1440) + 1440) % 1440;
  const h = String(Math.floor(norm / 60)).padStart(2, '0');
  const min = String(norm % 60).padStart(2, '0');
  return `${h}:${min}`;
}

interface TimeRange {
  start: number;
  end: number;
}

function parseTimeIntervals(intervalStr: string): TimeRange[] {
  const intervals: TimeRange[] = [];
  const parts = intervalStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.toLowerCase() === 'off' || trimmed.toLowerCase() === 'closed') {
      continue;
    }
    const rangeMatch = trimmed.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (rangeMatch) {
      const s = parseTimeToMins(rangeMatch[1]);
      let e = parseTimeToMins(rangeMatch[2]);
      if (s !== null && e !== null) {
        if (e === 0) e = 24 * 60; // 24:00 midnight
        intervals.push({ start: s, end: e });
      }
    }
  }
  return intervals;
}

/**
 * Expand day expressions like "Mo-Fr", "Tu,Th,Sa", "Mo-Su", "Su" into array of day indexes (0=Su, 1=Mo... 6=Sa)
 */
function expandDayExpression(expr: string): number[] {
  const days: number[] = [];
  const cleanExpr = expr.trim();

  // Range like "Mo-Fr" or "Tu-Su"
  const rangeMatch = cleanExpr.match(/^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/);
  if (rangeMatch) {
    const startIdx = DAY_ABBRS.findIndex((d) => d.toLowerCase() === rangeMatch[1].toLowerCase());
    const endIdx = DAY_ABBRS.findIndex((d) => d.toLowerCase() === rangeMatch[2].toLowerCase());
    if (startIdx !== -1 && endIdx !== -1) {
      let cur = startIdx;
      while (true) {
        days.push(cur);
        if (cur === endIdx) break;
        cur = (cur + 1) % 7;
      }
      return days;
    }
  }

  // Comma separated list like "Mo,We,Fr"
  const subParts = cleanExpr.split(',');
  for (const sub of subParts) {
    const idx = DAY_ABBRS.findIndex((d) => d.toLowerCase() === sub.trim().toLowerCase());
    if (idx !== -1 && !days.includes(idx)) {
      days.push(idx);
    }
  }

  return days;
}

export function evaluateOsmOpeningHours(
  rawOpeningHours?: string | null,
  visitTime?: string | null,
  visitEndTime?: string | null,
  dayDate?: string | null
): OpeningHoursEvaluation | null {
  if (!rawOpeningHours || typeof rawOpeningHours !== 'string') {
    return null;
  }

  const raw = rawOpeningHours.trim();
  if (!raw) return null;

  // 1. 24/7 check
  if (raw.toLowerCase() === '24/7') {
    return {
      raw,
      isOpen: true,
      warning: null,
      todayHoursText: 'Open 24 hours (24/7)',
      is24_7: true,
    };
  }

  // Determine target day of week (0=Su, 1=Mo... 6=Sa)
  let dayOfWeek = 6; // Default Saturday if unknown
  if (dayDate) {
    try {
      const d = new Date(dayDate.includes('T') ? dayDate : `${dayDate}T12:00:00Z`);
      if (!isNaN(d.getTime())) {
        dayOfWeek = d.getUTCDay();
      }
    } catch {
      // fallback
    }
  }

  const dayName = DAY_FULL[dayOfWeek];
  const dayAbbr = DAY_ABBRS[dayOfWeek];

  const plannedStartMins = visitTime ? parseTimeToMins(visitTime) : null;
  const plannedEndMins = visitEndTime ? parseTimeToMins(visitEndTime) : (plannedStartMins !== null ? plannedStartMins + 60 : null);

  // Parse rule blocks separated by ';'
  const ruleBlocks = raw.split(';').map((s) => s.trim()).filter(Boolean);

  // Day specific schedule map: 0..6 -> TimeRange[] | 'closed'
  const scheduleByDay: Array<TimeRange[] | 'closed'> = Array.from({ length: 7 }, () => []);

  let hasExplicitDayRules = false;

  for (const block of ruleBlocks) {
    // Check for "PH closed" or public holidays rule
    if (block.toLowerCase().startsWith('ph')) {
      continue;
    }

    // Match patterns like "Mo-Fr 08:30-17:00" or "Sa,Su 10:00-14:00,16:00-20:00" or "Su off" or "09:00-18:00"
    const matchWithDays = block.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?(?:,\s*[A-Za-z]{2})*)\s+(.+)$/);

    if (matchWithDays) {
      hasExplicitDayRules = true;
      const dayExpr = matchWithDays[1];
      const timeExpr = matchWithDays[2].trim();
      const affectedDays = expandDayExpression(dayExpr);

      if (timeExpr.toLowerCase() === 'off' || timeExpr.toLowerCase() === 'closed') {
        for (const d of affectedDays) {
          scheduleByDay[d] = 'closed';
        }
      } else {
        const ranges = parseTimeIntervals(timeExpr);
        for (const d of affectedDays) {
          if (scheduleByDay[d] !== 'closed') {
            scheduleByDay[d] = [...(scheduleByDay[d] as TimeRange[]), ...ranges];
          }
        }
      }
    } else {
      // Time without day specified e.g. "09:00-18:00" or "open"
      if (block.toLowerCase() === 'open') {
        for (let d = 0; d < 7; d++) {
          scheduleByDay[d] = [{ start: 0, end: 24 * 60 }];
        }
      } else if (block.toLowerCase() === 'off' || block.toLowerCase() === 'closed') {
        for (let d = 0; d < 7; d++) {
          scheduleByDay[d] = 'closed';
        }
      } else {
        const ranges = parseTimeIntervals(block);
        if (ranges.length > 0) {
          for (let d = 0; d < 7; d++) {
            scheduleByDay[d] = [...(scheduleByDay[d] as TimeRange[]), ...ranges];
          }
        }
      }
    }
  }

  const todaySchedule = scheduleByDay[dayOfWeek];

  if (todaySchedule === 'closed') {
    return {
      raw,
      isOpen: false,
      warning: `⚠️ Closed on ${dayName}s according to OpenStreetMap records.`,
      todayHoursText: `Closed on ${dayName}s`,
      is24_7: false,
    };
  }

  if (Array.isArray(todaySchedule) && todaySchedule.length > 0) {
    const formattedRanges = todaySchedule
      .map((r) => `${formatMins(r.start)} - ${formatMins(r.end)}`)
      .join(', ');
    const hoursText = `Open ${dayAbbr}: ${formattedRanges}`;

    if (plannedStartMins !== null && plannedEndMins !== null) {
      // Check if planned visit falls inside any open interval
      const insideAny = todaySchedule.some((r) => {
        // Allows a 15-minute margin
        return plannedStartMins >= r.start - 15 && plannedEndMins <= r.end + 15;
      });

      if (!insideAny) {
        // Check if opens later or closes earlier
        const earliestOpen = Math.min(...todaySchedule.map((r) => r.start));
        const latestClose = Math.max(...todaySchedule.map((r) => r.end));

        let specificWarning = '';
        if (plannedStartMins < earliestOpen) {
          specificWarning = `⚠️ Opens at ${formatMins(earliestOpen)} (${Math.round(earliestOpen - plannedStartMins)}m after planned ${formatMins(plannedStartMins)} start).`;
        } else if (plannedEndMins > latestClose) {
          specificWarning = `⚠️ Closes at ${formatMins(latestClose)} before your planned ${formatMins(plannedEndMins)} stop end.`;
        } else {
          specificWarning = `⚠️ Planned visit (${formatMins(plannedStartMins)}–${formatMins(plannedEndMins)}) may fall outside open slots: ${formattedRanges}.`;
        }

        return {
          raw,
          isOpen: false,
          warning: specificWarning,
          todayHoursText: hoursText,
          is24_7: false,
        };
      }

      return {
        raw,
        isOpen: true,
        warning: null,
        todayHoursText: hoursText,
        is24_7: false,
      };
    }

    return {
      raw,
      isOpen: true,
      warning: null,
      todayHoursText: hoursText,
      is24_7: false,
    };
  }

  // If we couldn't parse the specific day intervals with high confidence, return raw hours without blocking
  return {
    raw,
    isOpen: null,
    warning: null,
    todayHoursText: raw,
    is24_7: false,
  };
}
