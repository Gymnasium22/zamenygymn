const escapeHtml = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const inlineFormatting = (text: string): string =>
    text
        // Жирный
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Курсив (одна звёздочка)
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Ссылки
        .replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline hover:opacity-80">$1</a>'
        );

export const formatAnnouncement = (text: string): string => {
    const safe = escapeHtml(text);
    const lines = safe.split('\n');
    const result: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let listItems: string[] = [];

    const flushList = () => {
        if (listType && listItems.length > 0) {
            const tag = listType;
            const items = listItems.map((item) => `<li class="ml-4">${inlineFormatting(item)}</li>`).join('');
            result.push(`<${tag} class="list-disc space-y-1 my-3">${items}</${tag}>`);
            listItems = [];
            listType = null;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (line.startsWith('- ')) {
            if (listType && listType !== 'ul') flushList();
            listType = 'ul';
            listItems.push(line.slice(2));
            continue;
        }
        const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
            if (listType && listType !== 'ol') flushList();
            listType = 'ol';
            listItems.push(orderedMatch[2]);
            continue;
        }
        flushList();
        if (line.trim() === '') {
            result.push('<br />');
        } else {
            result.push(`<p class="leading-relaxed mb-3 last:mb-0">${inlineFormatting(line)}</p>`);
        }
    }
    flushList();

    return result.join('');
};
