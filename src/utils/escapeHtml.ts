/**
 * Escape special HTML characters to prevent XSS when injecting
 * user-controlled strings into HTML/SVG/Excel export templates.
 */
export const escapeHtml = (str: string | number | null | undefined): string => {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/**
 * Sanitize a CSS color value to prevent CSS injection.
 * Only allows hex (#fff, #ffffff), rgb/rgba, hsl/hsla, and named colors.
 * Falls back to empty string for invalid values.
 */
/**
 * Escape Markdown special characters for Telegram Bot API.
 * Use when parse_mode is 'Markdown' to prevent formatting injection.
 */
export const escapeMarkdown = (text: string | number | null | undefined): string => {
    if (text == null) return '';
    return String(text).replace(/[_*[\]`]/g, '\\$&');
};

export const sanitizeColor = (color: string | null | undefined): string => {
    if (!color) return '';
    const trimmed = color.trim();
    // Hex: #rgb or #rrggbb
    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
    // rgb/rgba
    if (/^rgba?\s*\([^)]+\)$/.test(trimmed)) return trimmed;
    // hsl/hsla
    if (/^hsla?\s*\([^)]+\)$/.test(trimmed)) return trimmed;
    // Named colors (alphabetic only, reasonable length)
    if (/^[a-zA-Z]{3,20}$/.test(trimmed)) return trimmed;
    return '';
};
