/* Utility helpers for parsing and safe updates in the webview UI */

export const isNumber = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

export function parseIntOrUndef(value: string): number | undefined {
    if (value === '' || value == null) {
        return undefined;
    }
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? undefined : n;
}

export function parseFloatOrUndef(value: string): number | undefined {
    if (value === '' || value == null) {
        return undefined;
    }
    const n = parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
}

// For params that treat empty as null (temperature, top_p)
export function parseFloatOrNull(value: string): number | null {
    if (value === '' || value == null) {
        return null;
    }
    const n = parseFloat(value);
    return Number.isNaN(n) ? null : n;
}

export function tryParseJson<T = unknown>(text: string): T | string | undefined {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        return JSON.parse(trimmed) as T;
    } catch {
        // Keep raw text to avoid data loss; caller may surface validation later
        return text;
    }
}

export function prettyJson(value: unknown): string {
    if (value == null) {
        return '';
    }
    if (typeof value === 'string') {
        return value; // raw
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}
