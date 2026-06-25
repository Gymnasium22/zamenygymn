import { useEffect } from 'react';
import { AppAnnouncement } from '../types';
import { useAuth } from '../context/AuthContext';
import { usersService } from '../services/users';
import { formatAnnouncement } from '../utils/announcementFormat';
import { Icon } from './Icons';
import { safeLocalStorageSet } from '../utils/localStorage';

interface AnnouncementModalProps {
    announcement: AppAnnouncement;
    onClose: () => void;
}

export const AnnouncementModal = ({ announcement, onClose }: AnnouncementModalProps) => {
    const { user } = useAuth();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleClose = () => {
        if (user?.uid && announcement.publishedAt) {
            usersService.dismissAppAnnouncement(user.uid, announcement.publishedAt);
            safeLocalStorageSet(`dismissedAppAnnouncement_${user.uid}`, announcement.publishedAt);
        }
        onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) handleClose();
    };

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
            onClick={handleBackdropClick}
            role="presentation"
        >
            <div
                className="relative w-full max-w-2xl rounded-[2.5rem] shadow-2xl animate-scale-in overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="announcement-title"
            >
                {/* Gradient border effect */}
                <div className="absolute -inset-[1px] rounded-[2.5rem] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 opacity-80 blur-[1px]" />

                <div className="relative bg-slate-900 rounded-[2.5rem] overflow-hidden">
                    {/* Background decorations */}
                    <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-br from-violet-600/30 via-fuchsia-600/20 to-transparent pointer-events-none" />
                    <div className="absolute -top-20 -right-20 w-64 h-64 bg-fuchsia-500/20 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative p-8 sm:p-12 text-center">
                        {/* Icon */}
                        <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/30 text-4xl">
                            🎉
                        </div>

                        {/* Title */}
                        <h2
                            id="announcement-title"
                            className="text-3xl sm:text-4xl font-black text-white mb-6 leading-tight tracking-tight"
                        >
                            {announcement.title || 'Объявление'}
                        </h2>

                        {/* Body */}
                        <div
                            className="text-left text-lg sm:text-xl text-slate-100/90 whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{
                                __html: formatAnnouncement(announcement.message || '')
                            }}
                        />

                        {/* Action */}
                        <div className="mt-10 flex justify-center">
                            <button
                                onClick={handleClose}
                                className="px-10 py-4 bg-white text-slate-900 rounded-2xl font-black text-lg hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 flex items-center gap-3"
                            >
                                <Icon name="CheckCircle" size={22} />
                                Понятно
                            </button>
                        </div>

                        {announcement.publishedAt && (
                            <p className="mt-6 text-xs text-slate-400">
                                Опубликовано {new Date(announcement.publishedAt).toLocaleDateString('ru-RU')}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
