/**
 * Prototype-pollution-safe object merge.
 * Skips dangerous keys like __proto__, constructor, prototype.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function safeMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
    const result: Record<string, unknown> = { ...target };
    for (const key of Object.keys(source)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        const val = source[key];
        if (
            typeof val === 'object' &&
            val !== null &&
            !Array.isArray(val) &&
            typeof result[key] === 'object' &&
            result[key] !== null &&
            !Array.isArray(result[key])
        ) {
            result[key] = safeMerge(result[key] as Record<string, unknown>, val as Record<string, unknown>);
        } else {
            result[key] = val;
        }
    }
    return result as T;
}

/**
 * Strip prototype-pollution keys from an object recursively.
 */
export function stripDangerousKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) {
        return obj.map(stripDangerousKeys);
    }
    if (obj !== null && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(obj)) {
            if (DANGEROUS_KEYS.has(key)) continue;
            result[key] = stripDangerousKeys((obj as Record<string, unknown>)[key]);
        }
        return result;
    }
    return obj;
}
