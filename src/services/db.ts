import { AppData } from '../types';
import { formatDateISO } from '../utils/helpers';

/** Local JSON download helper (no backend). */
export const dbService = {
    exportJson: (data: AppData) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gymnasium_backup_${formatDateISO()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};
