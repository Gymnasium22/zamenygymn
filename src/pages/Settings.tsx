import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStaticData, useScheduleData, useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { DateInput } from '../components/DateInput';
import { useToast, Modal } from '../components/UI';
import {
    TelegramTemplates,
    AdminAnnouncement,
    AppAnnouncement,
    BellPreset,
    AuditLogEntry,
    AppData,
    DashboardWidgetId,
    DashboardWidgetRole,
    CalendarEvent,
} from '../types';
import { INITIAL_DATA, getInitialData } from '../constants';
import { formatDateEuropean, formatDateISO, generateId } from '../utils/helpers';
import { auditLog } from '../services/auditLog';
import { logger } from '../utils/logger';
import { safeLocalStorageGet, safeLocalStorageRemove } from '../utils/localStorage';
import { stripDangerousKeys } from '../utils/safeMerge';
import { formatAnnouncement } from '../utils/announcementFormat';
import { SemesterConfig } from '../components/settings/SemesterConfig';
import { TelegramTemplateEditor } from '../components/settings/TelegramTemplateEditor';
import { dbService } from '../services/db';
import { AppDataImportSchema, AppDataImport } from '../utils/importSchema';
import { UsersManagement } from '../components/settings/UsersManagement';
import { OrganizationsManagement } from '../components/settings/OrganizationsManagement';
import { ArchiveYearSection } from '../components/settings/ArchiveYearSection';

type SettingsSection =
    | 'integrations'
    | 'institution'
    | 'schedule'
    | 'notifications'
    | 'widgets'
    | 'system'
    | 'users'
    | 'organizations';

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
    { id: 'integrations', label: 'Интеграции', icon: 'Plug' },
    { id: 'institution', label: 'Учреждение', icon: 'Building' },
    { id: 'schedule', label: 'Расписание', icon: 'Calendar' },
    { id: 'notifications', label: 'Уведомления', icon: 'MessageSquare' },
    { id: 'widgets', label: 'Виджеты', icon: 'Layout' },
    { id: 'system', label: 'Система', icon: 'Database' },
    { id: 'users', label: 'Пользователи', icon: 'Users' },
    { id: 'organizations', label: 'Организации', icon: 'Building2' }
];

// --- Helper Components ---

const PasswordInput: React.FC<{
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    id?: string;
}> = ({ value, onChange, placeholder, id }) => {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full border border-slate-200 dark:border-slate-600 p-3 pr-10 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
            />
            <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title={show ? 'Скрыть' : 'Показать'}
            >
                <Icon name={show ? 'EyeOff' : 'Eye'} size={18} />
            </button>
        </div>
    );
};

const SectionCard: React.FC<{
    title: string;
    icon: string;
    description?: string;
    children: React.ReactNode;
    isDirty: boolean;
    onSave: () => void;
    isSaving?: boolean;
}> = ({ title, icon, description, children, isDirty, onSave, isSaving }) => {
    return (
        <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Icon name={icon} size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 dark:text-white text-base">{title}</h3>
                        {description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
                {isDirty && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-100 dark:border-amber-900">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Изменено
                    </span>
                )}
            </div>
            <div className="p-6 space-y-6">{children}</div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/20 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                <button
                    onClick={onSave}
                    disabled={!isDirty || isSaving}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                        isDirty && !isSaving
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    }`}
                >
                    <Icon name={isSaving ? 'Loader' : 'Save'} size={16} className={isSaving ? 'animate-spin' : ''} />
                    {isSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
            </div>
        </div>
    );
};

const ConfirmModal: React.FC<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ isOpen, title, message, confirmText = 'Подтвердить', danger, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
            onClick={(e) => e.target === e.currentTarget && onCancel()}
        >
            <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition ${
                            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Calendar Events Editor ---

const CalendarEventsEditor: React.FC<{
    events: CalendarEvent[];
    onChange: (events: CalendarEvent[]) => void;
}> = ({ events, onChange }) => {
    const [form, setForm] = useState<CalendarEvent>({
        id: '',
        date: '',
        title: '',
        type: 'holiday',
        description: '',
        showInWidget: true
    });

    const handleAdd = () => {
        if (!form.date || !form.title.trim()) return;
        onChange([...events, { ...form, id: generateId() }]);
        setForm({ id: '', date: '', title: '', type: 'holiday', description: '', showInWidget: true });
    };

    const handleRemove = (id: string) => {
        onChange(events.filter((e) => e.id !== id));
    };

    const typeOptions: { value: CalendarEvent['type']; label: string }[] = [
        { value: 'holiday', label: 'Каникулы/выходной' },
        { value: 'celebration', label: 'Праздник' },
        { value: 'exam', label: 'Экзамен/контрольная' },
        { value: 'meeting', label: 'Собрание' },
        { value: 'event', label: 'Мероприятие' },
        { value: 'other', label: 'Другое' }
    ];

    const sorted = useMemo(
        () => [...events].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
        [events]
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Дата</label>
                    <input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="w-full border border-slate-200 dark:border-slate-600 p-2.5 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                    />
                </div>
                <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Название</label>
                    <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Например: Осенняя каникула"
                        className="w-full border border-slate-200 dark:border-slate-600 p-2.5 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                    />
                </div>
                <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Тип</label>
                    <select
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value as CalendarEvent['type'] })}
                        className="w-full border border-slate-200 dark:border-slate-600 p-2.5 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                    >
                        {typeOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="sm:col-span-1 flex items-end pb-3">
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer" title="Показывать на рабочем столе">
                        <input
                            type="checkbox"
                            checked={form.showInWidget !== false}
                            onChange={(e) => setForm({ ...form, showInWidget: e.target.checked })}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <Icon name="Monitor" size={16} />
                    </label>
                </div>
                <div className="sm:col-span-2">
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={!form.date || !form.title.trim()}
                        className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2"
                    >
                        <Icon name="Plus" size={16} /> Добавить
                    </button>
                </div>
            </div>

            {sorted.length === 0 ? (
                <p className="text-sm text-slate-400">Нет добавленных праздников или событий.</p>
            ) : (
                <div className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="text-left px-3 py-2 text-xs font-bold">Дата</th>
                                <th className="text-left px-3 py-2 text-xs font-bold">Название</th>
                                <th className="text-left px-3 py-2 text-xs font-bold">Тип</th>
                                <th className="text-left px-3 py-2 text-xs font-bold">Описание</th>
                                <th className="px-3 py-2 text-xs font-bold text-center">На столе</th>
                                <th className="px-3 py-2 text-xs font-bold text-right">Действие</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {sorted.map((ev) => (
                                <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                        {new Date(ev.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{ev.title}</td>
                                    <td className="px-3 py-2">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {typeOptions.find((o) => o.value === ev.type)?.label || ev.type}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-400 dark:text-slate-500 max-w-[200px] truncate" title={ev.description}>
                                        {ev.description || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {ev.showInWidget !== false && (
                                            <Icon name="Monitor" size={16} className="mx-auto text-indigo-500" title="Показывается на рабочем столе" />
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <button
                                            onClick={() => handleRemove(ev.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="Удалить"
                                        >
                                            <Icon name="Trash2" size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// --- Main Component ---

const DASHBOARD_WIDGET_ROLES: DashboardWidgetRole[] = ['admin', 'teacher', 'canteen', 'superadmin'];

const DEFAULT_DASHBOARD_WIDGET_ACCESS: Record<DashboardWidgetRole, DashboardWidgetId[]> = {
    admin: ['weather', 'kpi', 'search', 'substitutions', 'occupancy', 'conflicts', 'birthdays', 'notes'],
    teacher: ['weather', 'kpi', 'search', 'substitutions', 'occupancy', 'conflicts', 'birthdays', 'notes'],
    canteen: ['weather', 'kpi', 'search', 'substitutions', 'occupancy', 'conflicts', 'birthdays', 'notes'],
    superadmin: ['weather', 'kpi', 'search', 'substitutions', 'occupancy', 'conflicts', 'birthdays', 'notes']
};

const DASHBOARD_WIDGETS: { id: DashboardWidgetId; label: string }[] = [
    { id: 'weather', label: 'Погода' },
    { id: 'kpi', label: 'KPI' },
    { id: 'search', label: 'Поиск' },
    { id: 'substitutions', label: 'Замены' },
    { id: 'occupancy', label: 'Штат' },
    { id: 'conflicts', label: 'Конфликты' },
    { id: 'birthdays', label: 'Праздники' },
    { id: 'notes', label: 'Заметки' }
];

export const SettingsPage = () => {
    const {
        settings,
        privateSettings,
        saveStaticData,
        subjects,
        teachers,
        classes,
        rooms,
        bellSchedule,
        dutyZones
    } = useStaticData();
    const {
        schedule1,
        schedule2,
        substitutions,
        dutySchedule,
        nutritionRecords,
        absenteeismRecords
    } = useScheduleData();
    const { saveData } = useData();
    const { addToast } = useToast();
    const { role } = useAuth();

    const visibleSections = role === 'superadmin'
        ? SECTIONS
        : SECTIONS.filter((s) => s.id !== 'organizations');

    const [activeSection, setActiveSection] = useState<SettingsSection>('integrations');
    const [isSavingSection, setIsSavingSection] = useState<SettingsSection | null>(null);
    const [confirmResetOpen, setConfirmResetOpen] = useState(false);

    // Full DB Import / Export refs and states
    const dbFileInputRef = useRef<HTMLInputElement>(null);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [publicScheduleUrl, setPublicScheduleUrl] = useState('');
    
    const [QRCodeComponent, setQRCodeComponent] = useState<React.ComponentType<{ value: string; size?: number; level?: string; includeMargin?: boolean; className?: string }> | null>(null);
    useEffect(() => {
        if (isPublishModalOpen && publicScheduleUrl && !QRCodeComponent) {
            import('qrcode.react').then((mod) => setQRCodeComponent(() => mod.QRCodeSVG));
        }
    }, [isPublishModalOpen, publicScheduleUrl, QRCodeComponent]);

    useEffect(() => {
        if (settings?.publicScheduleId) {
            const publicUrl = `${window.location.origin}${window.location.pathname}#/public?id=${settings.publicScheduleId}`;
            setPublicScheduleUrl(publicUrl);
        } else {
            setPublicScheduleUrl('');
        }
    }, [settings?.publicScheduleId]);

    const fullAppData: AppData = useMemo(
        () => ({
            subjects,
            teachers,
            classes,
            rooms,
            settings,
            bellSchedule,
            schedule: schedule1,
            schedule2,
            substitutions,
            dutyZones,
            dutySchedule,
            nutritionRecords,
            absenteeismRecords,
            privateSettings,
        }),
        [
            subjects,
            teachers,
            classes,
            rooms,
            settings,
            bellSchedule,
            schedule1,
            schedule2,
            substitutions,
            dutyZones,
            dutySchedule,
            nutritionRecords,
            absenteeismRecords,
            privateSettings,
        ]
    );

    const validateImportData = (data: unknown): string[] => {
        const result = AppDataImportSchema.safeParse(data);
        if (!result.success) {
            return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
        }
        const d = result.data;
        const errors: string[] = [];
        if (!d.teachers?.length && !d.schedule?.length && !d.schedule2?.length) {
            errors.push('Файл не содержит распознаваемых данных (teachers/schedule/schedule2)');
        }

        // Referential integrity checks (prevents FK violations in Supabase)
        const classIds = new Set((d.classes || []).map((c) => c.id));
        const teacherIds = new Set((d.teachers || []).map((t) => t.id));
        const roomIds = new Set((d.rooms || []).map((r) => r.id));
        const roomByName = new Map((d.rooms || []).map((r) => [r.name, r.id]));
        const scheduleItemIds = new Set([
            ...(d.schedule || []).map((s) => s.id),
            ...(d.schedule2 || []).map((s) => s.id)
        ]);

        (d.schedule || []).forEach((item, index) => {
            if (item.classId && !classIds.has(item.classId)) {
                errors.push(`schedule[${index}]: classId "${item.classId}" не найден в classes`);
            }
            if (item.teacherId && !teacherIds.has(item.teacherId)) {
                errors.push(`schedule[${index}]: teacherId "${item.teacherId}" не найден в teachers`);
            }
            if (item.roomId && !roomIds.has(item.roomId) && !roomByName.has(item.roomId)) {
                errors.push(`schedule[${index}]: roomId "${item.roomId}" не найден в rooms`);
            }
        });
        (d.schedule2 || []).forEach((item, index) => {
            if (item.classId && !classIds.has(item.classId)) {
                errors.push(`schedule2[${index}]: classId "${item.classId}" не найден в classes`);
            }
            if (item.teacherId && !teacherIds.has(item.teacherId)) {
                errors.push(`schedule2[${index}]: teacherId "${item.teacherId}" не найден в teachers`);
            }
            if (item.roomId && !roomIds.has(item.roomId) && !roomByName.has(item.roomId)) {
                errors.push(`schedule2[${index}]: roomId "${item.roomId}" не найден в rooms`);
            }
        });
        (d.substitutions || []).forEach((sub, index) => {
            if (sub.scheduleItemId && !scheduleItemIds.has(sub.scheduleItemId)) {
                errors.push(`substitutions[${index}]: scheduleItemId "${sub.scheduleItemId}" не найден в schedule/schedule2`);
            }
            if (sub.originalTeacherId && !teacherIds.has(sub.originalTeacherId)) {
                errors.push(`substitutions[${index}]: originalTeacherId "${sub.originalTeacherId}" не найден в teachers`);
            }
            if (
                sub.replacementTeacherId &&
                !['conducted', 'cancelled'].includes(sub.replacementTeacherId) &&
                !teacherIds.has(sub.replacementTeacherId)
            ) {
                errors.push(`substitutions[${index}]: replacementTeacherId "${sub.replacementTeacherId}" не найден в teachers`);
            }
        });

        return errors;
    };

    const handleFullImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev: ProgressEvent<FileReader>) => {
            try {
                const rawJson = JSON.parse(ev.target?.result as string);
                const json = stripDangerousKeys(rawJson) as AppDataImport;

                const rawScheduleCount = (json.schedule?.length || 0) + (json.schedule2?.length || 0);
                const rawSubstitutionCount = json.substitutions?.length || 0;

                // Normalize legacy Firebase data before validation:
                // - old backups often stored room name/number as roomId instead of room.id
                // - some schedule items may reference deleted classes
                // - some substitutions may reference deleted schedule items/teachers
                const classIds = new Set((json.classes || []).map((c) => c.id));
                const roomIds = new Set((json.rooms || []).map((r) => r.id));
                const roomByName = new Map((json.rooms || []).map((r) => [r.name, r.id]));
                const teacherIds = new Set((json.teachers || []).map((t) => t.id));

                const normalizeSchedule = (items: typeof json.schedule): typeof json.schedule => {
                    if (!items) return undefined;
                    return items
                        .map((item) => {
                            if (item.roomId && !roomIds.has(item.roomId) && roomByName.has(item.roomId)) {
                                return { ...item, roomId: roomByName.get(item.roomId)! };
                            }
                            return item;
                        })
                        .filter((item) => !item.classId || classIds.has(item.classId)) as typeof json.schedule;
                };

                json.schedule = normalizeSchedule(json.schedule);
                json.schedule2 = normalizeSchedule(json.schedule2);

                const scheduleItemIds = new Set([
                    ...(json.schedule || []).map((s) => s.id),
                    ...(json.schedule2 || []).map((s) => s.id)
                ]);

                json.substitutions = (json.substitutions || []).filter((sub) => {
                    if (sub.scheduleItemId && !scheduleItemIds.has(sub.scheduleItemId)) return false;
                    if (sub.originalTeacherId && !teacherIds.has(sub.originalTeacherId)) return false;
                    if (
                        sub.replacementTeacherId &&
                        !['conducted', 'cancelled'].includes(sub.replacementTeacherId) &&
                        !teacherIds.has(sub.replacementTeacherId)
                    ) {
                        return false;
                    }
                    return true;
                }) as typeof json.substitutions;

                const normalizedScheduleCount = (json.schedule?.length || 0) + (json.schedule2?.length || 0);
                const normalizedSubstitutionCount = json.substitutions?.length || 0;
                const skippedSchedule = rawScheduleCount - normalizedScheduleCount;
                const skippedSubstitutions = rawSubstitutionCount - normalizedSubstitutionCount;

                const validationErrors = validateImportData(json);
                if (validationErrors.length > 0) {
                    addToast({
                        type: 'danger',
                        title: 'Неверный формат файла',
                        message: validationErrors.join('\n')
                    });
                    return;
                }
                if (window.confirm('Это перезапишет всю базу данных (все расписания, замены, списки). Продолжить?')) {
                    const initial = getInitialData();
                    const mergedData: Partial<AppData> = {
                        ...initial,
                        rooms: (json.rooms as AppData['rooms']) || initial.rooms,
                        classes: (json.classes as AppData['classes']) || [],
                        schedule: (json.schedule as AppData['schedule']) || [],
                        schedule2: (json.schedule2 as AppData['schedule2']) || [],
                        teachers: (json.teachers as AppData['teachers']) || [],
                        subjects: (json.subjects as AppData['subjects']) || [],
                        substitutions: (json.substitutions as AppData['substitutions']) || [],
                        dutyZones: (json.dutyZones as unknown as AppData['dutyZones']) || initial.dutyZones,
                        dutySchedule: (json.dutySchedule as unknown as AppData['dutySchedule']) || [],
                        nutritionRecords: (json.nutritionRecords as unknown as AppData['nutritionRecords']) || [],
                        absenteeismRecords: (json.absenteeismRecords as unknown as AppData['absenteeismRecords']) || [],
                        bellSchedule: (json.bellSchedule as AppData['bellSchedule']) || initial.bellSchedule,
                        settings: { ...settings, ...(json.settings || {}) }
                    };
                    try {
                        // Save everything in one operation so the provider can enforce the correct
                        // dependency order (reference tables → schedule items → substitutions).
                        await saveData(mergedData);
                        if (skippedSchedule > 0 || skippedSubstitutions > 0) {
                            addToast({
                                type: 'warning',
                                title: 'Импорт выполнен с потерями',
                                message: `База восстановлена, но пропущено ${skippedSchedule} строк расписания и ${skippedSubstitutions} замен из-за устаревших ссылок.`
                            });
                        } else {
                            addToast({ type: 'success', title: 'Успешно', message: 'База данных успешно восстановлена!' });
                        }
                    } catch (error) {
                        logger.error('Full import failed:', error);
                        addToast({
                            type: 'danger',
                            title: 'Импорт не выполнен',
                            message: 'Произошла ошибка при сохранении данных. Проверьте файл и попробуйте снова.'
                        });
                    }
                }
            } catch {
                addToast({ type: 'danger', title: 'Ошибка', message: 'Ошибка чтения файла.' });
            }
        };
        reader.readAsText(file);
    };

    const handlePublishSchedule = async () => {
        const newPublicId = generateId();
        try {
            await dbService.setPublicData(newPublicId, fullAppData);
            await saveStaticData({ settings: { ...settings, publicScheduleId: newPublicId } });
            const publicUrl = `${window.location.origin}${window.location.pathname}#/public?id=${newPublicId}`;
            setPublicScheduleUrl(publicUrl);
            setIsPublishModalOpen(true);
            addToast({ type: 'success', title: 'Успешно', message: 'Расписание опубликовано!' });
        } catch (e) {
            logger.error(e);
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось опубликовать расписание.' });
        }
    };

    const clearPublicSchedule = async () => {
        if (
            !settings.publicScheduleId ||
            !window.confirm(
                'Вы уверены, что хотите удалить публичное расписание? Оно станет недоступно по текущей ссылке.'
            )
        ) {
            return;
        }
        try {
            await dbService.deletePublicData(settings.publicScheduleId);
            await saveStaticData({ settings: { ...settings, publicScheduleId: null } });
            addToast({ type: 'success', title: 'Успешно', message: 'Публичное расписание удалено.' });
            setPublicScheduleUrl('');
        } catch (e) {
            logger.error(e);
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось удалить публичное расписание.' });
        }
    };

    // --- Local state for each section ---

    // Integrations
    const [telegramToken, setTelegramToken] = useState('');
    const [feedbackChatId, setFeedbackChatId] = useState('');
    const [adminTelegramChatId, setAdminTelegramChatId] = useState('');
    const [weatherApiKey, setWeatherApiKey] = useState('');
    const [weatherCity, setWeatherCity] = useState('');

    // Institution
    const [schoolName, setSchoolName] = useState('');
    const [directorName, setDirectorName] = useState('');
    const [unionChairName, setUnionChairName] = useState('');
    const [secretaryName, setSecretaryName] = useState('');
    const [currentYear, setCurrentYear] = useState<number | ''>('');

    // Schedule
    const [semesterConfig, setSemesterConfig] = useState<{
        firstSemesterMonths: number[];
        secondSemesterMonths: number[];
    }>({ firstSemesterMonths: [], secondSemesterMonths: [] });
    const [bellPresets, setBellPresets] = useState<BellPreset[]>([]);
    const [isScheduleLocked, setIsScheduleLocked] = useState(false);
    const [allowTeacherEdit, setAllowTeacherEdit] = useState(false);
    const [autoBackup, setAutoBackup] = useState(false);
    const [backupTime, setBackupTime] = useState('02:00');
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

    // System
    const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);

    // Notifications
    const [templates, setTemplates] = useState<TelegramTemplates>({
        summary: '',
        teacherNotification: '',
        teacherSummary: ''
    });
    const [announcement, setAnnouncement] = useState<AdminAnnouncement>({
        message: '',
        active: false,
        lastUpdated: ''
    });
    const [appAnnouncement, setAppAnnouncement] = useState<AppAnnouncement>({
        title: '',
        message: '',
        active: false,
        lastUpdated: '',
        publishedAt: ''
    });
    const [dashboardWidgetAccess, setDashboardWidgetAccess] = useState<Record<DashboardWidgetRole, DashboardWidgetId[]>>(DEFAULT_DASHBOARD_WIDGET_ACCESS);
    const [widgetAccessDirty, setWidgetAccessDirty] = useState(false);

    // Init from context
    useEffect(() => {
        if (!settings) return;
        setTelegramToken(privateSettings.telegramToken || '');
        setFeedbackChatId(settings.feedbackChatId || '');
        setAdminTelegramChatId(settings.adminTelegramChatId || '');
        setWeatherApiKey(privateSettings.weatherApiKey || '');
        setWeatherCity(settings.weatherCity || 'Minsk,BY');
        setSchoolName(settings.schoolName || '');
        setDirectorName(settings.directorName || '');
        setUnionChairName(settings.unionChairName || '');
        setSecretaryName(settings.secretaryName || '');
        setCurrentYear(settings.currentYear || '');
        setSemesterConfig(
            settings.semesterConfig || {
                firstSemesterMonths: [8, 9, 10, 11],
                secondSemesterMonths: [0, 1, 2, 3, 4]
            }
        );
        setBellPresets(settings.bellPresets || []);
        setIsScheduleLocked(settings.isScheduleLocked || false);
        setAllowTeacherEdit(settings.allowTeacherEdit || false);
        setAutoBackup(settings.autoBackup || false);
        setBackupTime(settings.backupTime || '02:00');
        setCalendarEvents(settings.calendarEvents || []);
        setSessionTimeoutMinutes(settings.sessionTimeoutMinutes || 30);
        setTemplates(
            settings.telegramTemplates || {
                summary: '⚡️ **ЗАМЕНЫ НА {{date}}** ⚡️\n\n{{content}}',
                teacherNotification:
                    '🔔 **Вам назначена замена!**\n📅 {{date}}\n\n{{content}}\n\nПожалуйста, ознакомьтесь с деталями.',
                teacherSummary:
                    '🔔 **Ваши замены на {{date}}**\n\n{{content}}Пожалуйста, ознакомьтесь с деталями.'
            }
        );
        setAnnouncement(
            settings.adminAnnouncement || { message: '', active: false, lastUpdated: '' }
        );
        setAppAnnouncement(
            settings.appAnnouncement || {
                title: '',
                message: '',
                active: false,
                lastUpdated: '',
                publishedAt: ''
            }
        );
        setDashboardWidgetAccess(
            settings.dashboardWidgetAccess
                ? { ...DEFAULT_DASHBOARD_WIDGET_ACCESS, ...settings.dashboardWidgetAccess }
                : DEFAULT_DASHBOARD_WIDGET_ACCESS
        );
    }, [settings, privateSettings]);

    useEffect(() => {
        if (!settings) return;
        setWidgetAccessDirty(
            JSON.stringify(dashboardWidgetAccess) !==
                JSON.stringify({ ...DEFAULT_DASHBOARD_WIDGET_ACCESS, ...(settings.dashboardWidgetAccess || {}) })
        );
    }, [dashboardWidgetAccess, settings]);

    // --- Dirty checks ---
    const integrationsDirty = useMemo(() => {
        if (!settings) return false;
        return (
            telegramToken !== (privateSettings.telegramToken || '') ||
            feedbackChatId !== (settings.feedbackChatId || '') ||
            adminTelegramChatId !== (settings.adminTelegramChatId || '') ||
            weatherApiKey !== (privateSettings.weatherApiKey || '') ||
            weatherCity !== (settings.weatherCity || 'Minsk,BY')
        );
    }, [telegramToken, feedbackChatId, adminTelegramChatId, weatherApiKey, weatherCity, settings, privateSettings]);

    const institutionDirty = useMemo(() => {
        if (!settings) return false;
        return (
            schoolName !== (settings.schoolName || '') ||
            directorName !== (settings.directorName || '') ||
            unionChairName !== (settings.unionChairName || '') ||
            secretaryName !== (settings.secretaryName || '') ||
            currentYear !== (settings.currentYear || '')
        );
    }, [schoolName, directorName, unionChairName, secretaryName, currentYear, settings]);

    const scheduleDirty = useMemo(() => {
        if (!settings) return false;
        const origSem = settings.semesterConfig || {
            firstSemesterMonths: [8, 9, 10, 11],
            secondSemesterMonths: [0, 1, 2, 3, 4]
        };
        const semChanged =
            JSON.stringify([...semesterConfig.firstSemesterMonths].sort()) !==
                JSON.stringify([...origSem.firstSemesterMonths].sort()) ||
            JSON.stringify([...semesterConfig.secondSemesterMonths].sort()) !==
                JSON.stringify([...origSem.secondSemesterMonths].sort());
        const lockChanged = (settings.isScheduleLocked || false) !== isScheduleLocked;
        const teacherEditChanged = (settings.allowTeacherEdit || false) !== allowTeacherEdit;
        const eventsChanged =
            JSON.stringify((settings.calendarEvents || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))) !==
            JSON.stringify(calendarEvents.slice().sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)));
        return semChanged || lockChanged || teacherEditChanged || eventsChanged;
    }, [semesterConfig, settings, isScheduleLocked, allowTeacherEdit, calendarEvents]);

    const systemDirty = useMemo(() => {
        if (!settings) return false;
        return (settings.sessionTimeoutMinutes || 30) !== sessionTimeoutMinutes;
    }, [settings, sessionTimeoutMinutes]);

    const notificationsDirty = useMemo(() => {
        if (!settings) return false;
        const origTemplates = settings.telegramTemplates || {
            summary: '⚡️ **ЗАМЕНЫ НА {{date}}** ⚡️\n\n{{content}}',
            teacherNotification:
                '🔔 **Вам назначена замена!**\n📅 {{date}}\n\n{{content}}\n\nПожалуйста, ознакомьтесь с деталями.',
            teacherSummary:
                '🔔 **Ваши замены на {{date}}**\n\n{{content}}Пожалуйста, ознакомьтесь с деталями.'
        };
        const origAnnouncement = settings.adminAnnouncement || {
            message: '',
            active: false,
            lastUpdated: ''
        };
        return (
            templates.summary !== origTemplates.summary ||
            templates.teacherNotification !== origTemplates.teacherNotification ||
            templates.teacherSummary !== origTemplates.teacherSummary ||
            announcement.message !== origAnnouncement.message ||
            announcement.active !== origAnnouncement.active
        );
    }, [templates, announcement, settings]);

    // --- Save handlers ---
    const saveIntegrations = useCallback(async () => {
        setIsSavingSection('integrations');
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    feedbackChatId,
                    adminTelegramChatId,
                    weatherCity,
                    weatherApiKey
                },
                privateSettings: {
                    ...privateSettings,
                    telegramToken,
                    weatherApiKey
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Настройки интеграций обновлены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, privateSettings, telegramToken, feedbackChatId, adminTelegramChatId, weatherApiKey, weatherCity, saveStaticData, addToast]);

    const saveInstitution = useCallback(async () => {
        setIsSavingSection('institution');
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    schoolName,
                    directorName,
                    unionChairName,
                    secretaryName,
                    currentYear: currentYear ? Number(currentYear) : undefined
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Данные учреждения обновлены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, schoolName, directorName, unionChairName, secretaryName, currentYear, saveStaticData, addToast]);

    const saveSchedule = useCallback(async () => {
        setIsSavingSection('schedule');
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    semesterConfig,
                    isScheduleLocked,
                    allowTeacherEdit,
                    calendarEvents
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Настройки расписания обновлены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, semesterConfig, isScheduleLocked, allowTeacherEdit, calendarEvents, saveStaticData, addToast]);

    const saveSystem = useCallback(async () => {
        setIsSavingSection('system');
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    sessionTimeoutMinutes
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Системные настройки обновлены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, sessionTimeoutMinutes, saveStaticData, addToast]);

    const saveNotifications = useCallback(async () => {
        setIsSavingSection('notifications');
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    telegramTemplates: templates,
                    adminAnnouncement: {
                        ...announcement,
                        lastUpdated: new Date().toISOString()
                    }
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Шаблоны и объявление обновлены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, templates, announcement, saveStaticData, addToast]);

    const saveWidgetAccess = useCallback(async () => {
        setIsSavingSection('widgets');
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    dashboardWidgetAccess
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Права доступа к виджетам обновлены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, dashboardWidgetAccess, saveStaticData, addToast]);

    const handleWidgetAccessToggle = useCallback(
        (role: DashboardWidgetRole, widgetId: DashboardWidgetId) => {
            setDashboardWidgetAccess((prev) => {
                const allowed = prev[role] || [];
                const next = allowed.includes(widgetId)
                    ? allowed.filter((id) => id !== widgetId)
                    : [...allowed, widgetId];
                return {
                    ...prev,
                    [role]: next
                };
            });
        },
        []
    );

    // --- System actions ---
    const handleExport = () => {
        const exportData = {
            settings: settings || {},
            privateSettings: privateSettings || {},
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gym-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addToast({ type: 'success', title: 'Экспорт', message: 'Настройки сохранены в файл' });
    };

    const handleImport = async (file: File) => {
        try {
            const text = await file.text();
            const rawData = JSON.parse(text);
            const data = stripDangerousKeys(rawData) as Record<string, unknown>;
            if (!data.settings) throw new Error('Неверный формат файла');
            await saveStaticData({
                settings: { ...settings, ...(data.settings as Record<string, unknown> || {}) },
                privateSettings: { ...privateSettings, ...(data.privateSettings as Record<string, unknown> || {}) }
            });
            addToast({ type: 'success', title: 'Импорт', message: 'Настройки восстановлены из файла' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка импорта', message: 'Файл повреждён или имеет неверный формат' });
        }
    };

    const handleSaveBackupSettings = async () => {
        setIsSavingSection('system');
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    autoBackup,
                    backupTime
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Настройки бэкапа обновлены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    };

    const handleReset = async () => {
        setConfirmResetOpen(false);
        const defaultSettings = INITIAL_DATA.settings;
        const defaultPrivate = INITIAL_DATA.privateSettings;
        try {
            await saveStaticData({
                settings: {
                    ...settings,
                    telegramToken: defaultSettings.telegramToken,
                    publicScheduleId: defaultSettings.publicScheduleId,
                    feedbackChatId: defaultSettings.feedbackChatId,
                    adminTelegramChatId: defaultSettings.adminTelegramChatId,
                    weatherCity: defaultSettings.weatherCity,
                    schoolName: defaultSettings.schoolName,
                    directorName: defaultSettings.directorName,
                    unionChairName: defaultSettings.unionChairName,
                    secretaryName: defaultSettings.secretaryName,
                    currentYear: defaultSettings.currentYear,
                    semesterConfig: defaultSettings.semesterConfig,
                    telegramTemplates: defaultSettings.telegramTemplates,
                    adminAnnouncement: defaultSettings.adminAnnouncement,
                    bellPresets: defaultSettings.bellPresets
                },
                privateSettings: defaultPrivate
            });
            addToast({ type: 'success', title: 'Сброс', message: 'Настройки сброшены к значениям по умолчанию' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сбросить настройки' });
        }
    };

    if (!settings) {
        return (
            <div className="h-full flex items-center justify-center">
                <Icon name="Loader" size={32} className="animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto w-full">
            <div className="shrink-0 mb-4">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                    <Icon name="Settings" className="text-indigo-600 dark:text-indigo-400" />
                    Настройки
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                    Управление интеграциями, данными учреждения, расписанием и уведомлениями
                </p>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6 min-h-0">
                {/* Sidebar */}
                <aside className="lg:w-64 shrink-0 overflow-y-auto overflow-x-hidden lg:overflow-x-visible">
                    <div className="lg:sticky lg:top-0">
                        <nav className="flex flex-wrap lg:flex-col gap-2 pb-2 lg:pb-0">
                            {visibleSections.map((section) => {
                                const isActive = activeSection === section.id;
                                const hasDirty =
                                    (section.id === 'integrations' && integrationsDirty) ||
                                    (section.id === 'institution' && institutionDirty) ||
                                    (section.id === 'schedule' && scheduleDirty) ||
                                    (section.id === 'notifications' && notificationsDirty) ||
                                    (section.id === 'system' && systemDirty);
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveSection(section.id)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex-shrink-0 lg:flex-shrink ${
                                            isActive
                                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 shadow-sm'
                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                        }`}
                                    >
                                        <Icon name={section.icon} size={18} />
                                        <span>{section.label}</span>
                                        {hasDirty && (
                                            <span className="ml-auto w-2 h-2 rounded-full bg-amber-500" />
                                        )}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                {/* Content */}
                <div className="flex-1 min-w-0 overflow-y-auto space-y-6 pr-1 pb-4">
                    {activeSection === 'integrations' && (
                        <SectionCard
                            title="Интеграции"
                            icon="Plug"
                            description="Telegram-бот, погода и внешние сервисы"
                            isDirty={integrationsDirty}
                            onSave={saveIntegrations}
                            isSaving={isSavingSection === 'integrations'}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Bot Token
                                        </label>
                                        <PasswordInput
                                            value={telegramToken}
                                            onChange={setTelegramToken}
                                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Токен от @BotFather. Используется для отправки уведомлений.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Chat ID для обратной связи
                                        </label>
                                        <PasswordInput
                                            value={feedbackChatId}
                                            onChange={setFeedbackChatId}
                                            placeholder="-100123456789 или 123456789"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            ID чата или пользователя для сбора обратной связи.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Telegram Chat ID администратора
                                        </label>
                                        <PasswordInput
                                            value={adminTelegramChatId}
                                            onChange={setAdminTelegramChatId}
                                            placeholder="123456789"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Личный ID администратора для системных уведомлений.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            OpenWeatherMap API Key
                                        </label>
                                        <PasswordInput
                                            value={weatherApiKey}
                                            onChange={setWeatherApiKey}
                                            placeholder="b6907d28..."
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Ключ для отображения погоды на рабочем столе.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Город
                                        </label>
                                        <input
                                            type="text"
                                            value={weatherCity}
                                            onChange={(e) => setWeatherCity(e.target.value)}
                                            placeholder="Minsk,BY"
                                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {activeSection === 'institution' && (
                        <SectionCard
                            title="Данные учреждения"
                            icon="Building"
                            description="Информация для документов и печатных форм"
                            isDirty={institutionDirty}
                            onSave={saveInstitution}
                            isSaving={isSavingSection === 'institution'}
                        >
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                        Название школы
                                    </label>
                                    <input
                                        type="text"
                                        value={schoolName}
                                        onChange={(e) => setSchoolName(e.target.value)}
                                        placeholder="ГУО «Гимназия №22 г.Минска»"
                                        className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Директор
                                        </label>
                                        <input
                                            type="text"
                                            value={directorName}
                                            onChange={(e) => setDirectorName(e.target.value)}
                                            placeholder="Н.В.Кисель"
                                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Пред. Профкома
                                        </label>
                                        <input
                                            type="text"
                                            value={unionChairName}
                                            onChange={(e) => setUnionChairName(e.target.value)}
                                            placeholder="Ю.Г.Миханова"
                                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Секретарь
                                        </label>
                                        <input
                                            type="text"
                                            value={secretaryName}
                                            onChange={(e) => setSecretaryName(e.target.value)}
                                            placeholder="Е.К.Шунто"
                                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Год (для документов)
                                        </label>
                                        <input
                                            type="number"
                                            value={currentYear}
                                            onChange={(e) =>
                                                setCurrentYear(
                                                    e.target.value === '' ? '' : Number(e.target.value)
                                                )
                                            }
                                            placeholder="2026"
                                            min={2000}
                                            max={2100}
                                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {activeSection === 'schedule' && (
                        <SectionCard
                            title="Расписание"
                            icon="Calendar"
                            description="Семестры и пресеты звонков"
                            isDirty={scheduleDirty}
                            onSave={saveSchedule}
                            isSaving={isSavingSection === 'schedule'}
                        >
                            <div className="space-y-6">
                                <div>
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <Icon name="Calendar" size={16} />
                                        Распределение месяцев по семестрам
                                    </h4>
                                    <SemesterConfig
                                        firstSemesterMonths={semesterConfig.firstSemesterMonths}
                                        secondSemesterMonths={semesterConfig.secondSemesterMonths}
                                        onChange={(first, second) =>
                                            setSemesterConfig({ firstSemesterMonths: first, secondSemesterMonths: second })
                                        }
                                    />
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <Icon name="Bell" size={16} />
                                        Пресеты звонков
                                    </h4>
                                    {bellPresets.length === 0 ? (
                                        <p className="text-sm text-slate-400">Нет сохранённых пресетов.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {bellPresets.map((preset) => (
                                                <div
                                                    key={preset.id}
                                                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                                                >
                                                    <div>
                                                        <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                            {preset.name}
                                                        </div>
                                                        <div className="text-xs text-slate-400">
                                                            {preset.bells.length} записей
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-slate-400">
                                                        ID: {preset.id}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-[11px] text-slate-400 mt-2">
                                        Полноценное редактирование пресетов доступно в разделе{' '}
                                        <a href="#/bells" className="text-indigo-600 dark:text-indigo-400 underline">
                                            Звонки
                                        </a>
                                        .
                                    </p>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <Icon name="Lock" size={16} />
                                        Безопасность
                                    </h4>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div
                                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                                isScheduleLocked ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600'
                                            }`}
                                            onClick={() => setIsScheduleLocked(!isScheduleLocked)}
                                        >
                                            <div
                                                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                    isScheduleLocked ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                                Заблокировать редактирование расписания
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                При включении никто не сможет менять уроки, пока админ не разблокирует
                                            </div>
                                        </div>
                                    </label>

                                    <label className="flex items-center gap-3 cursor-pointer group mt-4">
                                        <div
                                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                                allowTeacherEdit ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600'
                                            }`}
                                            onClick={() => setAllowTeacherEdit(!allowTeacherEdit)}
                                        >
                                            <div
                                                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                    allowTeacherEdit ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                                Разрешить учителям редактировать расписание
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                Учитель сможет самостоятельно вносить изменения в расписание уроков
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <Icon name="Gift" size={16} />
                                        Праздники и события
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                        Отображаются в школьном календаре и на виджете рабочего стола.
                                    </p>
                                    <CalendarEventsEditor events={calendarEvents} onChange={setCalendarEvents} />
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {activeSection === 'notifications' && (
                        <SectionCard
                            title="Уведомления"
                            icon="MessageSquare"
                            description="Шаблоны Telegram и доска объявлений"
                            isDirty={notificationsDirty}
                            onSave={saveNotifications}
                            isSaving={isSavingSection === 'notifications'}
                        >
                            <div className="space-y-8">
                                <div>
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <Icon name="Send" size={16} />
                                        Шаблоны сообщений Telegram
                                    </h4>
                                    <TelegramTemplateEditor templates={templates} onChange={setTemplates} />
                                </div>

                                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <Icon name="Bell" size={16} />
                                        Доска объявлений
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                        Сообщение отобразится на рабочем столе всех пользователей.
                                    </p>
                                    <textarea
                                        value={announcement.message}
                                        onChange={(e) =>
                                            setAnnouncement({ ...announcement, message: e.target.value })
                                        }
                                        rows={4}
                                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 resize-none"
                                        placeholder="Например: Срочный педсовет сегодня в 14:00..."
                                    />
                                    <div className="flex items-center justify-between mt-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <div
                                                className={`w-12 h-6 rounded-full p-1 transition-colors ${
                                                    announcement.active
                                                        ? 'bg-indigo-500'
                                                        : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                            >
                                                <div
                                                    className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${
                                                        announcement.active ? 'translate-x-6' : 'translate-x-0'
                                                    }`}
                                                />
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={announcement.active}
                                                onChange={() =>
                                                    setAnnouncement((prev) => ({ ...prev, active: !prev.active }))
                                                }
                                            />
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                                Активно
                                            </span>
                                        </label>
                                        {announcement.lastUpdated && (
                                            <span className="text-xs text-slate-400">
                                                Обновлено: {formatDateEuropean(announcement.lastUpdated)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <Icon name="Megaphone" size={16} />
                                        Всплывающее уведомление
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                        Красивое уведомление с эмодзи и разметкой. Каждый пользователь
                                        увидит его один раз после публикации.
                                    </p>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                                Заголовок
                                            </label>
                                            <input
                                                type="text"
                                                value={appAnnouncement.title || ''}
                                                onChange={(e) =>
                                                    setAppAnnouncement({ ...appAnnouncement, title: e.target.value })
                                                }
                                                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                                placeholder="🎉 Важная новость"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                                Текст уведомления
                                            </label>
                                            <textarea
                                                value={appAnnouncement.message}
                                                onChange={(e) =>
                                                    setAppAnnouncement({ ...appAnnouncement, message: e.target.value })
                                                }
                                                rows={6}
                                                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 resize-none"
                                                placeholder="Например: **Срочный педсовет** сегодня в 14:00!\n- Пункт 1\n- Пункт 2"
                                            />
                                            <p className="mt-1.5 text-[10px] text-slate-400">
                                                Поддерживается: **жирный**, *курсив*, - списки, 1. нумерация,
                                                [ссылка](https://...), эмодзи.
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                                Предпросмотр
                                            </label>
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-800 dark:text-slate-200">
                                                <h5 className="font-bold text-base mb-2">
                                                    {appAnnouncement.title || 'Уведомление'}
                                                </h5>
                                                <div
                                                    className="whitespace-pre-wrap"
                                                    dangerouslySetInnerHTML={{
                                                        __html: appAnnouncement.message
                                                            ? formatAnnouncement(appAnnouncement.message)
                                                            : '<p class="text-slate-400 italic">Текст уведомления...</p>'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const now = new Date().toISOString();
                                                    const next = {
                                                        ...appAnnouncement,
                                                        title: appAnnouncement.title || 'Уведомление',
                                                        active: true,
                                                        publishedAt: now,
                                                        lastUpdated: now
                                                    };
                                                    setAppAnnouncement(next);
                                                    saveStaticData({
                                                        settings: {
                                                            ...settings,
                                                            appAnnouncement: next
                                                        }
                                                    });
                                                    addToast({
                                                        type: 'success',
                                                        title: 'Опубликовано',
                                                        message: 'Всплывающее уведомление опубликовано.'
                                                    });
                                                }}
                                                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition"
                                            >
                                                <Icon name="Send" size={16} />
                                                {appAnnouncement.publishedAt ? 'Переопубликовать' : 'Опубликовать'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = {
                                                        ...appAnnouncement,
                                                        active: false,
                                                        lastUpdated: new Date().toISOString()
                                                    };
                                                    setAppAnnouncement(next);
                                                    saveStaticData({
                                                        settings: {
                                                            ...settings,
                                                            appAnnouncement: next
                                                        }
                                                    });
                                                    addToast({
                                                        type: 'info',
                                                        title: 'Снято с публикации',
                                                        message: 'Всплывающее уведомление снято с публикации.'
                                                    });
                                                }}
                                                className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 transition"
                                            >
                                                Снять с публикации
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                            <span>
                                                Статус:{" "}
                                                <span
                                                    className={`font-bold ${
                                                        appAnnouncement.active
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : 'text-slate-600 dark:text-slate-400'
                                                    }`}
                                                >
                                                    {appAnnouncement.active ? 'Опубликовано' : 'Черновик'}
                                                </span>
                                            </span>
                                            {appAnnouncement.publishedAt && (
                                                <span>
                                                    Опубликовано:{" "}
                                                    {formatDateEuropean(appAnnouncement.publishedAt)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {activeSection === 'widgets' && (
                        <SectionCard
                            title="Доступ к виджетам"
                            icon="Layout"
                            description="Выберите, какие виджеты доступны пользователям каждой роли"
                            isDirty={widgetAccessDirty}
                            onSave={saveWidgetAccess}
                            isSaving={isSavingSection === 'widgets'}
                        >
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-slate-700 dark:text-slate-300 border-separate border-spacing-0 w-full">
                                    <thead>
                                        <tr className="bg-slate-100 dark:bg-slate-800">
                                            <th className="p-3 text-left font-bold">Виджет</th>
                                            {DASHBOARD_WIDGET_ROLES.map((role) => (
                                                <th key={role} className="p-3 text-center font-bold capitalize">
                                                    {role}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DASHBOARD_WIDGETS.map((widget) => (
                                            <tr key={widget.id} className="border-t border-slate-200 dark:border-slate-700">
                                                <td className="p-3 font-medium text-slate-700 dark:text-slate-200">
                                                    {widget.label}
                                                </td>
                                                {DASHBOARD_WIDGET_ROLES.map((role) => (
                                                    <td key={`${role}-${widget.id}`} className="p-3 text-center">
                                                        <label className="inline-flex items-center justify-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={dashboardWidgetAccess[role].includes(widget.id)}
                                                                onChange={() => handleWidgetAccessToggle(role, widget.id)}
                                                                className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                        </label>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                                Настройки действуют на всех пользователей выбранной роли.
                            </p>
                        </SectionCard>
                    )}

                    {activeSection === 'users' && (
                        <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                            <UsersManagement />
                        </div>
                    )}

                    {activeSection === 'organizations' && (
                        <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                            <OrganizationsManagement />
                        </div>
                    )}

                    {activeSection === 'system' && (
                        <div className="space-y-6">
                            <ArchiveYearSection />

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                        <Icon name="Shield" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                            Автоматический бэкап
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Отправка резервной копии в Telegram
                                        </p>
                                    </div>
                                </div>
                                <BackupControls
                                    settings={settings}
                                    privateSettings={privateSettings}
                                    autoBackup={autoBackup}
                                    backupTime={backupTime}
                                    onAutoBackupChange={setAutoBackup}
                                    onBackupTimeChange={setBackupTime}
                                    onSave={handleSaveBackupSettings}
                                    isSaving={isSavingSection === 'system'}
                                />
                            </div>

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                            <Icon name="Download" size={20} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                                    Резервная копия настроек
                                                </h3>
                                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                                                    Только настройки
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Экспорт и импорт системных настроек, ключей API и шаблонов
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={handleExport}
                                        className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-xl font-bold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition flex items-center justify-center gap-2"
                                    >
                                        <Icon name="Download" size={16} />
                                        Экспортировать настройки
                                    </button>
                                    <label className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-600">
                                        <Icon name="Upload" size={16} />
                                        Импортировать настройки
                                        <input
                                            type="file"
                                            accept=".json"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleImport(file);
                                                e.currentTarget.value = '';
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                                            <Icon name="Database" size={20} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                                    Полная копия базы данных
                                                </h3>
                                                <span className="text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                                                    Вся база данных
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Сохранение и восстановление всех данных: расписаний, замен, питания, пропусков, справочников (учителя, классы, предметы)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={() => {
                                            const { privateSettings: _, ...exportData } = fullAppData;
                                            dbService.exportJson(exportData as AppData);
                                        }}
                                        className="px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-xl font-bold text-sm hover:bg-purple-100 dark:hover:bg-purple-900/40 transition flex items-center justify-center gap-2"
                                    >
                                        <Icon name="Download" size={16} />
                                        Экспортировать всю БД
                                    </button>
                                    <label className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-600">
                                        <Icon name="Upload" size={16} />
                                        Восстановить всю БД из JSON
                                        <input
                                            type="file"
                                            ref={dbFileInputRef}
                                            accept=".json"
                                            className="hidden"
                                            onChange={handleFullImport}
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                                        <Icon name="QrCode" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                            Публичное расписание
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Публикация интерактивной версии расписания для учеников и родителей
                                        </p>
                                    </div>
                                </div>
                                
                                {publicScheduleUrl ? (
                                    <div className="space-y-4">
                                        <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ссылка для просмотра</div>
                                                <a 
                                                    href={publicScheduleUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline break-all block"
                                                >
                                                    {publicScheduleUrl}
                                                </a>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(publicScheduleUrl);
                                                        addToast({ type: 'success', title: 'Успешно', message: 'Ссылка скопирована' });
                                                    }}
                                                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 rounded-lg transition"
                                                    title="Копировать ссылку"
                                                >
                                                    <Icon name="Copy" size={16} />
                                                </button>
                                                <button
                                                    onClick={() => setIsPublishModalOpen(true)}
                                                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 rounded-lg transition"
                                                    title="Показать QR-код"
                                                >
                                                    <Icon name="QrCode" size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={handlePublishSchedule}
                                                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-2"
                                            >
                                                <Icon name="RefreshCw" size={16} />
                                                Обновить публикацию
                                            </button>
                                            <button
                                                onClick={clearPublicSchedule}
                                                className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl font-bold text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition flex items-center gap-2 border border-red-100 dark:border-red-900"
                                            >
                                                <Icon name="Trash2" size={16} />
                                                Удалить публикацию
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                            Расписание ещё не опубликовано. Создайте общедоступную версию, которой смогут пользоваться ученики и учителя без авторизации.
                                        </p>
                                        <button
                                            onClick={handlePublishSchedule}
                                            className="px-4 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 transition flex items-center gap-2"
                                        >
                                            <Icon name="Share2" size={16} />
                                            Опубликовать расписание
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                            <Icon name="Clock" size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                                Безопасность сессии
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Автоматический выход при бездействии
                                            </p>
                                        </div>
                                    </div>
                                    {systemDirty && (
                                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-100 dark:border-amber-900">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            Изменено
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Таймаут бездействия, мин
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={120}
                                            value={sessionTimeoutMinutes}
                                            onChange={(e) => setSessionTimeoutMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
                                            className="w-full sm:w-40 border border-slate-200 dark:border-slate-600 p-2.5 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Через указанное время неактивности пользователь будет автоматически разлогинен.
                                        </p>
                                    </div>
                                    <button
                                        onClick={saveSystem}
                                        disabled={!systemDirty || isSavingSection === 'system'}
                                        className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition shrink-0 ${
                                            systemDirty && isSavingSection !== 'system'
                                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                        }`}
                                    >
                                        <Icon name={isSavingSection === 'system' ? 'Loader' : 'Save'} size={16} className={isSavingSection === 'system' ? 'animate-spin' : ''} />
                                        {isSavingSection === 'system' ? 'Сохранение...' : 'Сохранить'}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                        <Icon name="FileText" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                            Журнал действий
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Кто и когда изменял данные
                                        </p>
                                    </div>
                                </div>
                                <AuditLogViewer />
                            </div>

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                                        <Icon name="AlertTriangle" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                            Сброс настроек
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Вернуть все настройки к значениям по умолчанию
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setConfirmResetOpen(true)}
                                    className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl font-bold text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition flex items-center gap-2 border border-red-100 dark:border-red-900"
                                >
                                    <Icon name="RotateCcw" size={16} />
                                    Сбросить к значениям по умолчанию
                                </button>
                            </div>

                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                                        <Icon name="HardDrive" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                            Локальный кэш
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Очистка устаревших данных из браузера
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        if (window.confirm('Очистить локальный кэш? Данные в облаке останутся, но после очистки потребуется повторная загрузка.')) {
                                            safeLocalStorageRemove('gym_data_local_backup_v2');
                                            safeLocalStorageRemove('gym_sync_queue_backup');
                                            safeLocalStorageRemove('gym_calendar_events');
                                            addToast({ type: 'success', title: 'Кэш очищен', message: 'Локальные данные удалены' });
                                        }
                                    }}
                                    className="px-4 py-2.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded-xl font-bold text-sm hover:bg-orange-100 dark:hover:bg-orange-900/40 transition flex items-center gap-2 border border-orange-100 dark:border-orange-900"
                                >
                                    <Icon name="Trash2" size={16} />
                                    Очистить локальный кэш
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmResetOpen}
                title="Сбросить все настройки?"
                message="Это действие вернёт все настройки к начальным значениям. Данные справочников, расписания и замен не пострадают. Рекомендуется предварительно сделать экспорт."
                confirmText="Сбросить"
                danger
                onConfirm={handleReset}
                onCancel={() => setConfirmResetOpen(false)}
            />

            <Modal
                isOpen={isPublishModalOpen}
                onClose={() => setIsPublishModalOpen(false)}
                title="Публичное расписание"
            >
                <div className="flex flex-col items-center justify-center p-4 text-center space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Отсканируйте QR-код или перейдите по ссылке, чтобы увидеть публичное расписание.
                    </p>
                    {publicScheduleUrl && QRCodeComponent && (
                        <>
                            <QRCodeComponent
                                value={publicScheduleUrl}
                                size={256}
                                level="H"
                                includeMargin={true}
                                className="p-2 bg-white border border-slate-200 rounded-lg shadow-md"
                            />
                            <a
                                href={publicScheduleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline text-sm font-medium break-all"
                            >
                                {publicScheduleUrl}
                            </a>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(publicScheduleUrl);
                                    addToast({ type: 'success', title: 'Успешно', message: 'Ссылка скопирована' });
                                }}
                                className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition flex items-center gap-2"
                            >
                                <Icon name="Copy" size={16} /> Копировать ссылку
                            </button>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
};

// Backup Controls Component
const BackupControls: React.FC<{
    settings: AppData['settings'];
    privateSettings: AppData['privateSettings'];
    autoBackup: boolean;
    backupTime: string;
    onAutoBackupChange: (v: boolean) => void;
    onBackupTimeChange: (v: string) => void;
    onSave: () => void;
    isSaving: boolean;
}> = ({ settings, privateSettings, autoBackup, backupTime, onAutoBackupChange, onBackupTimeChange, onSave, isSaving }) => {
    const { addToast } = useToast();
    const [isBackingUp, setIsBackingUp] = useState(false);

    const handleBackupNow = async () => {
        setIsBackingUp(true);
        try {
            const data = safeLocalStorageGet('gym_data_local_backup_v2');
            if (!data) {
                addToast({ type: 'warning', title: 'Бэкап', message: 'Нет данных для бэкапа' });
                return;
            }
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `gymnasium_backup_${formatDateISO()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Send to Telegram if configured
            if (privateSettings.telegramToken && settings.feedbackChatId) {
                const formData = new FormData();
                formData.append('chat_id', settings.feedbackChatId);
                formData.append('caption', `Автобэкап ${formatDateEuropean(new Date())}`);
                formData.append('document', new File([blob], `backup_${formatDateISO()}.json`, { type: 'application/json' }));
                await fetch(
                    `https://api.telegram.org/bot${privateSettings.telegramToken}/sendDocument`,
                    { method: 'POST', body: formData }
                );
                addToast({ type: 'success', title: 'Бэкап', message: 'Файл сохранён и отправлен в Telegram' });
            } else {
                addToast({ type: 'success', title: 'Бэкап', message: 'Файл сохранён' });
            }
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось создать бэкап' });
        } finally {
            setIsBackingUp(false);
        }
    };

    const dirty = (settings.autoBackup || false) !== autoBackup || (settings.backupTime || '02:00') !== backupTime;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        autoBackup ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600'
                    }`}
                    onClick={() => onAutoBackupChange(!autoBackup)}
                >
                    <div
                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            autoBackup ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                </div>
                <div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Автоматический бэкап</div>
                    <div className="text-xs text-slate-400">Каждый день в указанное время</div>
                </div>
            </div>

            {autoBackup && (
                <div className="flex items-center gap-3">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Время:</label>
                    <DateInput
                        type="time"
                        value={backupTime}
                        onChange={onBackupTimeChange}
                        className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                    />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                    onClick={handleBackupNow}
                    disabled={isBackingUp}
                    className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-xl font-bold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition flex items-center gap-2 disabled:opacity-50"
                >
                    <Icon name={isBackingUp ? 'Loader' : 'Download'} size={16} className={isBackingUp ? 'animate-spin' : ''} />
                    {isBackingUp ? 'Создание...' : 'Создать бэкап сейчас'}
                </button>
                <button
                    onClick={onSave}
                    disabled={!dirty || isSaving}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition ${
                        dirty && !isSaving
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                    }`}
                >
                    <Icon name={isSaving ? 'Loader' : 'Save'} size={16} className={isSaving ? 'animate-spin' : ''} />
                    {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
            </div>
            <p className="text-[11px] text-slate-400">
                Автобэкап отправляется только в Telegram без сохранения на устройство.
                Ручной бэкап — скачивает файл и отправляет в Telegram (если настроен).
            </p>
        </div>
    );
};

// Audit Log Viewer Component
const AuditLogViewer: React.FC = () => {
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [viewOrganizationId, setViewOrganizationId] = useState<string>('');
    const { addToast } = useToast();
    const { organizationId, organizations, isSuperAdmin } = useAuth();

    const effectiveOrgFilter = isSuperAdmin ? (viewOrganizationId || null) : organizationId;

    const fetchEntries = useCallback(async () => {
        setIsLoading(true);
        try {
            const logs = await auditLog.getEntries(100, effectiveOrgFilter);
            setEntries(logs);
        } catch (e) {
            logger.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [effectiveOrgFilter]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const actionLabels: Record<string, string> = {
        create: 'Создание',
        update: 'Изменение',
        delete: 'Удаление',
        import: 'Импорт',
        export: 'Экспорт',
        apply: 'Применение'
    };

    const entityLabels: Record<string, string> = {
        schedule: 'Расписание',
        substitution: 'Замена',
        teacher: 'Учитель',
        class: 'Класс',
        room: 'Кабинет',
        subject: 'Предмет',
        settings: 'Настройки',
        bells: 'Звонки',
        duty: 'Дежурство',
        nutrition: 'Питание',
        absenteeism: 'Пропуски',
        user: 'Пользователь',
        organization: 'Организация'
    };

    const actionDescriptions: Record<string, string> = {
        create: 'Создан новый объект',
        update: 'Объект изменён',
        delete: 'Объект удалён',
        import: 'Выполнен импорт данных',
        export: 'Выполнен экспорт данных',
        apply: 'Настройки применены'
    };

    const handleRefresh = () => fetchEntries();

    const handleExportJson = async () => {
        setIsLoading(true);
        try {
            const all = await auditLog.getEntries(200, effectiveOrgFilter);
            const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `audit_log_${formatDateISO()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            addToast({ type: 'success', title: 'Экспорт', message: 'Журнал действий сохранён в JSON' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось экспортировать журнал' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = async () => {
        setIsLoading(true);
        try {
            const all = await auditLog.getEntries(200, effectiveOrgFilter);
            if (all.length === 0) {
                addToast({ type: 'warning', title: 'Журнал пуст', message: 'Нет данных для экспорта' });
                return;
            }
            const BOM = '\uFEFF';
            const headers = ['Дата', 'Время', 'Пользователь', 'Роль', 'Действие', 'Тип объекта', 'Название объекта', 'Подробное описание'];
            const rows = all.map((e) => {
                const dt = new Date(e.timestamp);
                const date = dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const time = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const action = actionLabels[e.action] || e.action;
                const entity = entityLabels[e.entityType || ''] || e.entityType || '';
                const baseDesc = actionDescriptions[e.action] || e.action;
                const fullDesc = [
                    baseDesc,
                    e.entityName ? `Объект: «${e.entityName}»` : '',
                    e.details ? `Детали: ${e.details}` : ''
                ].filter(Boolean).join('. ');
                return [date, time, e.userEmail, e.userRole, action, entity, e.entityName || '', fullDesc]
                    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';');
            });
            const csv = BOM + [headers.map((h) => `"${h}"`).join(';'), ...rows].join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            addToast({ type: 'success', title: 'Экспорт в Excel', message: `Выгружено ${all.length} записей` });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось экспортировать журнал' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = async () => {
        if (!window.confirm('Очистить весь журнал действий? Это действие необратимо.')) return;
        setIsLoading(true);
        try {
            await auditLog.clear(effectiveOrgFilter);
            setEntries([]);
            addToast({ type: 'success', title: 'Журнал очищен', message: 'Все записи удалены' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось очистить журнал' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-3">
                <button
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                    <Icon name={isLoading ? 'Loader' : 'RefreshCw'} size={12} className={isLoading ? 'animate-spin' : ''} /> Обновить
                </button>
                <button
                    onClick={handleExportJson}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                    <Icon name="Download" size={12} /> Скачать JSON
                </button>
                <button
                    onClick={handleExportExcel}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                    <Icon name="FileSpreadsheet" size={12} /> Экспорт в Excel
                </button>
                <button
                    onClick={handleClear}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition flex items-center gap-1.5 ml-auto disabled:opacity-50"
                >
                    <Icon name="Trash2" size={12} /> Очистить журнал
                </button>
            </div>
            {isSuperAdmin && (
                <div className="flex items-center gap-3 mb-3">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Организация:</label>
                    <select
                        value={viewOrganizationId}
                        onChange={(e) => setViewOrganizationId(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Все организации</option>
                        {organizations.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            <div className="max-h-64 overflow-y-auto custom-scrollbar border border-slate-100 dark:border-slate-700 rounded-xl relative">
                {isLoading && entries.length === 0 ? (
                    <div className="p-12 text-center text-sm text-slate-400 flex flex-col items-center justify-center">
                        <Icon name="Loader" size={32} className="animate-spin text-indigo-600 mb-2" />
                        Загрузка журнала...
                    </div>
                ) : entries.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-400">
                        <Icon name="FileText" size={32} className="mx-auto mb-2 opacity-30" />
                        Журнал пуст
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
                            <tr>
                                <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Дата/Время</th>
                                <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">Пользователь</th>
                                {isSuperAdmin && (
                                    <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">Организация</th>
                                )}
                                <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">Действие</th>
                                <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">Объект</th>
                                <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">Подробности</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {entries.map((entry) => (
                                <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                                        {new Date(entry.timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}{' '}
                                        <span className="font-mono">
                                            {new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 truncate max-w-[120px] text-xs" title={entry.userEmail}>
                                        {entry.userEmail}
                                    </td>
                                    {isSuperAdmin && (
                                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs truncate max-w-[120px]">
                                            {organizations.find((o) => o.id === entry.organizationId)?.name || '—'}
                                        </td>
                                    )}
                                    <td className="px-3 py-2">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                            entry.action === 'delete'
                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                : entry.action === 'create'
                                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                  : entry.action === 'import'
                                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                        }`}>
                                            {actionLabels[entry.action] || entry.action}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">
                                        {entityLabels[entry.entityType || ''] || entry.entityType || ''}
                                        {entry.entityName && (
                                            <span className="text-slate-400 ml-1">«{entry.entityName}»</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-slate-400 dark:text-slate-500 text-xs max-w-[180px]" title={entry.details}>
                                        <span className="line-clamp-1">{entry.details || '—'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
