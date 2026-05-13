import React, { useState } from 'react';
import { TelegramTemplates } from '../../types';

interface TelegramTemplateEditorProps {
    templates: TelegramTemplates;
    onChange: (templates: TelegramTemplates) => void;
}

const PREVIEW_DATE = '15.09.2026';
const PREVIEW_CONTENT =
    '• 3 урок — 5А (Математика) → Иванова А.П.\n• 5 урок — 7Б (Физика) → Петров С.В.';

const TEMPLATE_META = [
    {
        key: 'summary' as const,
        label: 'Общая сводка (Канал/Группа)',
        description: 'Отправляется в общий чат со списком всех замен'
    },
    {
        key: 'teacherNotification' as const,
        label: 'Личное уведомление (Один урок)',
        description: 'Отправляется учителю при назначении одной замены'
    },
    {
        key: 'teacherSummary' as const,
        label: 'Личная сводка (Все замены учителя)',
        description: 'Отправляется учителю со списком всех его замен на день'
    }
];

const renderPreview = (text: string) => {
    return text
        .replace(/\{\{date\}\}/g, PREVIEW_DATE)
        .replace(/\{\{content\}\}/g, PREVIEW_CONTENT);
};

export const TelegramTemplateEditor: React.FC<TelegramTemplateEditorProps> = ({
    templates,
    onChange
}) => {
    const [activeTab, setActiveTab] = useState<keyof TelegramTemplates>('summary');

    const update = (key: keyof TelegramTemplates, value: string) => {
        onChange({ ...templates, [key]: value });
    };

    const activeMeta = TEMPLATE_META.find((t) => t.key === activeTab)!;
    const currentValue = templates[activeTab];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {TEMPLATE_META.map((meta) => (
                    <button
                        key={meta.key}
                        type="button"
                        onClick={() => setActiveTab(meta.key)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                            activeTab === meta.key
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        {meta.label}
                    </button>
                ))}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
                {activeMeta.description}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                        Шаблон Markdown
                    </label>
                    <textarea
                        value={currentValue}
                        onChange={(e) => update(activeTab, e.target.value)}
                        rows={8}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 font-mono leading-relaxed resize-y"
                        placeholder="Введите шаблон..."
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                        {['{{date}}', '{{content}}'].map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => {
                                    const textarea = document.activeElement as HTMLTextAreaElement;
                                    if (textarea && textarea.tagName === 'TEXTAREA') {
                                        const start = textarea.selectionStart;
                                        const end = textarea.selectionEnd;
                                        const newText =
                                            currentValue.substring(0, start) +
                                            v +
                                            currentValue.substring(end);
                                        update(activeTab, newText);
                                        setTimeout(() => {
                                            textarea.selectionStart = textarea.selectionEnd =
                                                start + v.length;
                                            textarea.focus();
                                        }, 0);
                                    } else {
                                        update(activeTab, currentValue + v);
                                    }
                                }}
                                className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                                title="Вставить переменную"
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                        Предпросмотр
                    </label>
                    <div className="border border-slate-200 dark:border-slate-600 rounded-xl p-4 bg-[#f5f5f5] dark:bg-[#0e1621] text-sm whitespace-pre-wrap leading-relaxed min-h-[12rem]">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-black/5 dark:border-white/5">
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                TG
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                    Bot Preview
                                </div>
                                <div className="text-[10px] text-slate-400">сегодня</div>
                            </div>
                        </div>
                        <div className="text-slate-800 dark:text-slate-100">
                            {renderPreview(currentValue).split('\n').map((line, i) => (
                                <div key={i} className="break-words">
                                    {line.startsWith('**') && line.endsWith('**') ? (
                                        <strong>{line.replace(/\*\*/g, '')}</strong>
                                    ) : line.startsWith('•') ? (
                                        <span className="text-slate-600 dark:text-slate-300">
                                            {line}
                                        </span>
                                    ) : (
                                        line
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
