import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
    SESSION_SEARCH_DATE_TYPES_VALUES,
    type NameValuePair,
    type RecordOrUndef,
    type SessionSearchDateFilter,
    type SessionSearchDatePreset,
    type SessionSearchRequest
} from 'pika-shared/types/chatbot/chatbot-types';
import { DEFAULT_PAGE_SIZE } from './session-insights.state.svelte';

export function createDefaultDateFilter(): SessionSearchDateFilter {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 1 * 7 * 24 * 60 * 60 * 1000);
    return {
        dateType: 'created',
        startDate: oneWeekAgo.toISOString(),
        endDate: now.toISOString()
    };
}

export function createDefaultSearchQuery(): SessionSearchRequest<RecordOrUndef> {
    const result: SessionSearchRequest<RecordOrUndef> = {
        sortBy: [
            {
                field: 'createDate',
                order: 'desc'
            }
        ],
        size: DEFAULT_PAGE_SIZE
    };

    return result;
}

/**
 * This returns a tuple.  The first element is the date dropdown label and the second is the value to show in the date dropdown itself
 */
export function getSessionSearchDateDisplayValue(
    placeholder: string,
    timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
    filter?: SessionSearchDateFilter,
    compact: boolean = false
): [string, string] {
    const tzDisplayName = getTimeZoneDisplayName(timezone);
    const DEFAULT_LABEL = `Date Range (${tzDisplayName})`;
    if (!filter?.startDate) return [DEFAULT_LABEL, placeholder];

    const start = parseISO(filter.startDate);
    const end = filter.endDate ? parseISO(filter.endDate) : new Date();

    const typeLabel = SESSION_SEARCH_DATE_TYPES_VALUES.find((t) => t.value === filter.dateType)?.name ?? filter.dateType;

    let startFormatted: string;
    let endFormatted: string;

    if (compact) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const startYear = start.getFullYear();
        const endYear = end.getFullYear();

        // Check if same day
        const isSameDay = formatInTimeZone(start, timezone, 'yyyy-MM-dd') === formatInTimeZone(end, timezone, 'yyyy-MM-dd');

        // Only omit year if BOTH dates are in current year
        const bothInCurrentYear = startYear === currentYear && endYear === currentYear;

        if (isSameDay) {
            // Same day: just show date once and time range
            const dateFormat = bothInCurrentYear ? 'M/d' : 'M/d/yy';
            const dateStr = formatInTimeZone(start, timezone, dateFormat);
            const startTime = formatInTimeZone(start, timezone, 'h:mmaaaaa').replace(/am|pm/i, (match) => match.charAt(0).toLowerCase());
            const endTime = formatInTimeZone(end, timezone, 'h:mmaaaaa').replace(/am|pm/i, (match) => match.charAt(0).toLowerCase());
            return [`${typeLabel}`, `${dateStr} ${startTime}-${endTime}`];
        } else {
            // Different days: use compact format
            const dateTimeFormat = bothInCurrentYear ? 'M/d h:mmaaaaa' : 'M/d/yy h:mmaaaaa';

            startFormatted = formatInTimeZone(start, timezone, dateTimeFormat).replace(/am|pm/i, (match) => match.charAt(0).toLowerCase());
            endFormatted = formatInTimeZone(end, timezone, dateTimeFormat).replace(/am|pm/i, (match) => match.charAt(0).toLowerCase());
        }
    } else {
        const formatStr = 'MMM d, yyyy h:mm a'; // Aug 2, 2025 3:45 PM
        startFormatted = formatInTimeZone(start, timezone, formatStr);
        endFormatted = formatInTimeZone(end, timezone, formatStr);
    }

    return [`${typeLabel} ${compact ? '' : `(${tzDisplayName})`}`, `${startFormatted} - ${endFormatted}`];
}

export function getTimeZoneDisplayName(timeZone: string, style: 'short' | 'long' = 'short', locale: string = 'en-US'): string {
    const formatter = new Intl.DateTimeFormat(locale, {
        timeZone,
        timeZoneName: style
    });

    // Extract the timeZoneName part
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value ?? timeZone;
}

export function getStartAndEndDate(preset: SessionSearchDatePreset): [string, string] {
    const now = new Date();
    if (preset == '1-minute') {
        return [new Date(now.getTime() - 1 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == '5-minutes') {
        return [new Date(now.getTime() - 1 * 5 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-hour') {
        return [new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-day') {
        return [new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-week') {
        return [new Date(now.getTime() - 1 * 7 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-month') {
        return [new Date(now.getTime() - 1 * 30 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-3months') {
        return [new Date(now.getTime() - 1 * 90 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-6-months') {
        return [new Date(now.getTime() - 1 * 6 * 30 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-year') {
        return [new Date(now.getTime() - 1 * 365 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else if (preset == 'last-2-years') {
        return [new Date(now.getTime() - 1 * 2 * 365 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()];
    } else {
        throw new Error(`Invalid preset: ${preset}`);
    }
}

const TIMEZONES = [
    // US
    'America/Los_Angeles', // Pacific
    'America/Denver', // Mountain
    'America/Chicago', // Central
    'America/New_York', // Eastern

    // Europe
    'Europe/London', // UK
    'Europe/Paris', // France
    'Europe/Berlin', // Germany
    'Europe/Madrid', // Spain

    // Asia
    'Asia/Tokyo', // Japan

    // Global
    'Etc/UTC' // Coordinated Universal Time
];

export function getTimezoneValues(): NameValuePair<string>[] {
    return TIMEZONES.map((tz) => ({
        value: tz,
        name: getTimeZoneDisplayName(tz, 'short')
    }));
}
