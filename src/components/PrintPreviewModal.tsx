import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';

interface PrintPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    htmlContent: string;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({ isOpen, onClose, title, htmlContent }) => {
    const [scale, setScale] = useState(0.6);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { margin: 0; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; background: white; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 12px; }
                th { background: #f1f5f9; font-weight: bold; }
            </style>
        </head>
        <body>${htmlContent}</body>
        </html>
    `;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">{title}</h3>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <button onClick={() => setScale((s) => Math.max(0.3, s - 0.1))} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">−</button>
                            <span>{Math.round(scale * 100)}%</span>
                            <button onClick={() => setScale((s) => Math.min(1.5, s + 0.1))} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">+</button>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <Icon name="X" size={20} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 p-4">
                    <div
                        className="bg-white shadow-lg mx-auto origin-top"
                        style={{ width: '210mm', transform: `scale(${scale})`, transformOrigin: 'top center' }}
                    >
                        <iframe
                            srcDoc={fullHtml}
                            className="w-full border-0"
                            style={{ width: '210mm', height: '297mm' }}
                            title="preview"
                        />
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
                    >
                        Закрыть
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-sm font-medium"
                    >
                        <Icon name="Printer" size={16} className="inline mr-2" />
                        Печать
                    </button>
                </div>
            </div>
        </div>
    );
};
