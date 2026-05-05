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

        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
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
     * Copies text to clipboard.
     */
    copyToClipboard: async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy text: ', err);
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
                ${content}
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
