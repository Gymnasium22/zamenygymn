import React, { useState } from 'react';
import { Icon } from './Icons';
import { Modal } from './UI';
import { useAuth } from '../context/AuthContext';
import { useToast } from './UI';
import { logger } from '../utils/logger';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const [type, setType] = useState<'bug' | 'feature' | 'other'>('bug');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;
        setSending(true);

        try {
            // Send to Telegram if configured, otherwise just log
            const payload = {
                type,
                message: message.trim(),
                user: user?.email || 'unknown',
                url: window.location.href,
                timestamp: new Date().toISOString()
            };

            // Try to send via Telegram bot if token is available
            const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
            const chatId = import.meta.env.VITE_FEEDBACK_CHAT_ID;
            if (token && chatId) {
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: `📝 *Обратная связь*\n\n*Тип:* ${type === 'bug' ? 'Ошибка' : type === 'feature' ? 'Идея' : 'Другое'}\n*От:* ${payload.user}\n*URL:* ${payload.url}\n\n${payload.message}`,
                        parse_mode: 'Markdown'
                    })
                });
            } else {
                logger.info('Feedback (no Telegram):', payload);
            }

            addToast({ type: 'success', title: 'Спасибо!', message: 'Ваше сообщение отправлено.' });
            setMessage('');
            onClose();
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось отправить сообщение.' });
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Обратная связь" maxWidth="max-w-md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Тип сообщения
                    </label>
                    <div className="flex gap-2">
                        {[
                            { id: 'bug', label: 'Ошибка', icon: 'AlertTriangle' },
                            { id: 'feature', label: 'Идея', icon: 'Zap' },
                            { id: 'other', label: 'Другое', icon: 'MessageSquare' }
                        ].map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setType(t.id as typeof type)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
                                    type === t.id
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-700'
                                        : 'bg-slate-50 text-slate-500 border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600'
                                }`}
                            >
                                <Icon name={t.icon} size={16} />
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Описание
                    </label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                        placeholder="Опишите проблему или предложение..."
                        required
                    />
                </div>
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
                    >
                        Отмена
                    </button>
                    <button
                        type="submit"
                        disabled={sending || !message.trim()}
                        className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-sm font-medium disabled:opacity-60"
                    >
                        {sending ? 'Отправка...' : 'Отправить'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};
