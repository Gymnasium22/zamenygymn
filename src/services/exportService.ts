import DOMPurify from 'dompurify';
import { logger } from '../utils/logger';
import { isInsideTelegram } from '../miniapp/telegram';

const UNSAFE_COLOR = /oklch|oklab|lch\(|lab\(|color-mix|color\(/i;

const asCssColor = (value: string, fallback: string): string => {
    if (!value || value === 'none' || UNSAFE_COLOR.test(value)) return fallback;
    return value;
};

/** html2canvas cannot parse color-mix / oklch used by the 2026 theme. Inline rgb() from computed styles. */
const flattenPaintStyles = (source: HTMLElement, target: HTMLElement) => {
    const apply = (src: Element, dst: Element) => {
        if (src instanceof HTMLElement && dst instanceof HTMLElement) {
            const cs = window.getComputedStyle(src);
            dst.style.color = asCssColor(cs.color, '#0f172a');
            dst.style.backgroundColor = asCssColor(cs.backgroundColor, 'transparent');
            dst.style.backgroundImage = 'none';
            dst.style.boxShadow = 'none';
            dst.style.textShadow = 'none';
            dst.style.filter = 'none';
            dst.style.backdropFilter = 'none';
            dst.style.borderTopColor = asCssColor(cs.borderTopColor, 'transparent');
            dst.style.borderRightColor = asCssColor(cs.borderRightColor, 'transparent');
            dst.style.borderBottomColor = asCssColor(cs.borderBottomColor, 'transparent');
            dst.style.borderLeftColor = asCssColor(cs.borderLeftColor, 'transparent');
            dst.style.outlineColor = asCssColor(cs.outlineColor, 'transparent');
            dst.style.textDecorationColor = asCssColor(cs.textDecorationColor, dst.style.color);
        }
        const srcKids = src.children;
        const dstKids = dst.children;
        for (let i = 0; i < srcKids.length && i < dstKids.length; i++) {
            apply(srcKids[i], dstKids[i]);
        }
    };
    apply(source, target);
};

const canvasScaleFor = (width: number, height: number): number => {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const maxSide = 4096;
    const maxArea = 16_777_216;
    const bySide = Math.min(maxSide / w, maxSide / h);
    const byArea = Math.sqrt(maxArea / (w * h));
    return Math.max(1, Math.min(2, bySide, byArea));
};

const triggerAnchorDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
};

/**
 * Service for handling data exports to various formats (Excel, PNG, CSV).
 * Centralizes the logic for generating downloadable files.
 */
export const exportService = {
    /**
     * Saves HTML content as an Excel (.xls) file using a standard template.
     */
    saveAsExcel: (content: string, fileName: string, customStyles?: string) => {
        const html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>
                    table { border-collapse: collapse; font-family: Arial, sans-serif; width: 100%; }
                    th, td { border: 1px solid #000; padding: 5px; text-align: left; vertical-align: middle; }
                    .header { background-color: #f3f4f6; font-weight: bold; text-align: center; }
                    .title-main { font-size: 18pt; font-weight: bold; text-align: center; border: none; }
                    .title-sub { font-size: 12pt; text-align: center; border: none; }
                    .approval-block { text-align: left; border: none !important; font-family: "Times New Roman", serif; font-size: 11pt; }
                    .footer-block { border: none !important; font-weight: bold; text-align: left; padding-top: 20px; font-size: 11pt; font-family: "Times New Roman", serif; }
                    .empty-row { border: none !important; height: 15px; }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: bold; }
                    ${customStyles || ''}
                </style>
            </head>
            <body>
                ${content}
            </body>
            </html>
        `;

        // Use text/html with UTF-8 BOM so Excel can correctly open the HTML table
        const blob = new Blob(['\uFEFF' + html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName.endsWith('.xls') ? fileName : `${fileName}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Saves a TSV/CSV string as a file.
     */
    saveAsCSV: (content: string, fileName: string, type: 'csv' | 'tsv' = 'csv') => {
        const blob = new Blob([content], { type: type === 'csv' ? 'text/csv' : 'text/tab-separated-values' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName.endsWith(`.${type}`) ? fileName : `${fileName}.${type}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Rasterize a DOM node to PNG and save it.
     * Isolates the clone from theme CSS (color-mix/oklch) that html2canvas cannot parse.
     * In Telegram uses the system share sheet (download attribute is ignored there).
     */
    captureAndDownloadPng: async (element: HTMLElement, fileName: string): Promise<void> => {
        const { default: html2canvas } = await import('html2canvas');
        const clone = element.cloneNode(true) as HTMLElement;
        flattenPaintStyles(element, clone);
        clone.style.position = 'fixed';
        clone.style.left = '-12000px';
        clone.style.top = '0';
        clone.style.zIndex = '-1';
        clone.style.margin = '0';
        clone.style.backgroundColor = '#ffffff';
        clone.style.boxShadow = 'none';
        clone.style.width = `${Math.max(element.scrollWidth, element.offsetWidth, 800)}px`;
        clone.style.maxWidth = 'none';
        document.body.appendChild(clone);

        try {
            const scale = canvasScaleFor(clone.scrollWidth || 800, clone.scrollHeight || 600);
            const canvas = await html2canvas(clone, {
                scale,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: false,
                foreignObjectRendering: false,
                onclone: (_doc, clonedEl) => {
                    clonedEl.style.backgroundColor = '#ffffff';
                    clonedEl.style.boxShadow = 'none';
                }
            });
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned empty'))), 'image/png');
            });

            const file = new File([blob], fileName, { type: 'image/png' });
            const canShareFiles =
                typeof navigator.share === 'function' &&
                typeof navigator.canShare === 'function' &&
                navigator.canShare({ files: [file] });

            if (isInsideTelegram() && canShareFiles) {
                try {
                    await navigator.share({ files: [file], title: fileName });
                    return;
                } catch (shareErr) {
                    if ((shareErr as { name?: string }).name === 'AbortError') return;
                    logger.warn('Share failed, falling back to download', shareErr);
                }
            }

            triggerAnchorDownload(blob, fileName);
        } finally {
            clone.remove();
        }
    },

    /**
     * Copies text to clipboard.
     */
    copyToClipboard: async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            logger.error('Failed to copy text: ', err);
            return false;
        }
    },

    /**
     * Common template for the Director's Approval block in documents.
     */
    getApprovalBlock: (year: number = new Date().getFullYear()) => `
        <table>
            <tr>
                <td colspan="2" style="border:none"></td>
                <td colspan="2" class="approval-block">
                    <b>УТВЕРЖДАЮ</b><br>
                    Директор государственного<br>
                    учреждения образования<br>
                    «Гимназия № 22 г. Минска»<br><br>
                    __________ Н.В.Кисель<br>
                    "__" ______ ${year}г.
                </td>
            </tr>
            <tr class="empty-row"><td colspan="4" style="border:none"></td></tr>
        </table>
    `,

    /**
     * Opens a print dialog for HTML content.
     */
    printHTML: (content: string, title: string = 'Document'): boolean => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return false;

        const sanitizedContent = DOMPurify.sanitize(content, {
            USE_PROFILES: { html: true }
        });

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f0f0f0; font-weight: bold; }
                    .text-center { text-align: center; }
                    h1 { text-align: center; margin-bottom: 20px; }
                    @media print {
                        @page { margin: 1cm; }
                    }
                </style>
            </head>
            <body>
                ${sanitizedContent}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
        return true;
    }
};
