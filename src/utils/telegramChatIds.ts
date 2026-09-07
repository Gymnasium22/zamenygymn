/** Разбор списка Chat ID (запятая, пробел, новая строка). */
export function parseTelegramChatIds(raw?: string | null): string[] {
    if (!raw) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[\s,;]+/)) {
        const id = part.trim();
        if (!id) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}
