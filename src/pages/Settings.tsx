import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStaticData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { useToast } from '../components/UI';
import {
    TelegramTemplates,
    AdminAnnouncement,
    BellPreset
} from '../types';
import { INITIAL_DATA } from '../constants';
import { formatDateEuropean } from '../utils/helpers';
import { SemesterConfig } from '../components/settings/SemesterConfig';
import { TelegramTemplateEditor } from '../components/settings/TelegramTemplateEditor';

type SettingsSection =
    | 'integrations'
    | 'institution'
    | 'schedule'
    | 'notifications'
    | 'system';

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
    { id: 'integrations', label: 'Интеграции', icon: 'Plug' },
    { id: 'institution', label: 'Учреждение', icon: 'Building' },
    { id: 'schedule', label: 'Расписание', icon: 'Calendar' },
    { id: 'notifications', label: 'Уведомления', icon: 'MessageSquare' },
    { id: 'system', label: 'Система', icon: 'Database' }
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

// --- Main Component ---

export const SettingsPage = () => {
    const { settings, privateSettings, saveStaticData } = useStaticData();
    const { addToast } = useToast();

    const [activeSection, setActiveSection] = useState<SettingsSection>('integrations');
    const [isSavingSection, setIsSavingSection] = useState<SettingsSection | null>(null);
    const [confirmResetOpen, setConfirmResetOpen] = useState(false);

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
    }, [settings, privateSettings]);

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
        return semChanged;
    }, [semesterConfig, settings]);

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
                    weatherCity
                },
                privateSettings: {
                    ...privateSettings,
                    telegramToken,
                    weatherApiKey
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Настройки интеграций обновлены' });
        } catch (e) {
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
        } catch (e) {
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
                    semesterConfig
                }
            });
            addToast({ type: 'success', title: 'Сохранено', message: 'Настройки расписания обновлены' });
        } catch (e) {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, semesterConfig, saveStaticData, addToast]);

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
        } catch (e) {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось сохранить' });
        } finally {
            setIsSavingSection(null);
        }
    }, [settings, templates, announcement, saveStaticData, addToast]);

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
            const data = JSON.parse(text);
            if (!data.settings) throw new Error('Неверный формат файла');
            await saveStaticData({
                settings: { ...settings, ...data.settings },
                privateSettings: { ...privateSettings, ...data.privateSettings }
            });
            addToast({ type: 'success', title: 'Импорт', message: 'Настройки восстановлены из файла' });
        } catch (e) {
            addToast({ type: 'danger', title: 'Ошибка импорта', message: 'Файл повреждён или имеет неверный формат' });
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
        } catch (e) {
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
        <div className="h-full flex flex-col max-w-6xl mx-auto w-full">
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
                            {SECTIONS.map((section) => {
                                const isActive = activeSection === section.id;
                                const hasDirty =
                                    (section.id === 'integrations' && integrationsDirty) ||
                                    (section.id === 'institution' && institutionDirty) ||
                                    (section.id === 'schedule' && scheduleDirty) ||
                                    (section.id === 'notifications' && notificationsDirty);
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
                                        <input
                                            type="text"
                                            value={feedbackChatId}
                                            onChange={(e) => setFeedbackChatId(e.target.value)}
                                            placeholder="-100123456789 или 123456789"
                                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            ID чата или пользователя для сбора обратной связи.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                                            Telegram Chat ID администратора
                                        </label>
                                        <input
                                            type="text"
                                            value={adminTelegramChatId}
                                            onChange={(e) => setAdminTelegramChatId(e.target.value)}
                                            placeholder="123456789"
                                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
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
                                        Сообщение отобразится на рабочем столе всех учителей.
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
                            </div>
                        </SectionCard>
                    )}

                    {activeSection === 'system' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                        <Icon name="Download" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                            Резервная копия
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Экспорт и импорт всех настроек
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={handleExport}
                                        className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-xl font-bold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition flex items-center justify-center gap-2"
                                    >
                                        <Icon name="Download" size={16} />
                                        Экспортировать в JSON
                                    </button>
                                    <label className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-600">
                                        <Icon name="Upload" size={16} />
                                        Импортировать из JSON
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
        </div>
    );
};
