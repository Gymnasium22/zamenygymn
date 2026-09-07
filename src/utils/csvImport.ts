export type CsvRow = Record<string, string>;

const splitLine = (line: string, sep: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQ = !inQ;
            }
        } else if (ch === sep && !inQ) {
            out.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur.trim());
    return out;
};

export function parseDelimited(text: string): CsvRow[] {
    const raw = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const sep =
        (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    const headers = splitLine(lines[0], sep).map((h) => h.toLowerCase().replace(/\s+/g, ''));
    return lines.slice(1).map((line) => {
        const cells = splitLine(line, sep);
        const row: CsvRow = {};
        headers.forEach((h, i) => {
            row[h] = cells[i] || '';
        });
        return row;
    });
}

export function pick(row: CsvRow, keys: string[]): string {
    for (const k of keys) {
        const hit = Object.keys(row).find((h) => h === k || h.includes(k));
        if (hit && row[hit]) return row[hit];
    }
    return '';
}
