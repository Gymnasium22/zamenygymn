import { useEffect, useRef, useCallback } from 'react';
import { authAdapter } from '../services/authAdapter';
import { logger } from '../utils/logger';

interface UseSessionTimeoutOptions {
    timeoutMinutes?: number;
    warningMinutes?: number;
    onWarning?: () => void;
    onTimeout?: () => void;
}

export const useSessionTimeout = ({
    timeoutMinutes = 30,
    warningMinutes = 2,
    onWarning,
    onTimeout
}: UseSessionTimeoutOptions = {}) => {
    const lastActivityRef = useRef(Date.now());
    const warningShownRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setInterval>>();

    const resetTimer = useCallback(() => {
        lastActivityRef.current = Date.now();
        warningShownRef.current = false;
    }, []);

    const logout = useCallback(async () => {
        try {
            await authAdapter.signOut();
            onTimeout?.();
        } catch (e) {
            logger.error('Auto-logout error:', e);
        }
    }, [onTimeout]);

    useEffect(() => {
        const timeoutMs = timeoutMinutes * 60 * 1000;
        const warningMs = warningMinutes * 60 * 1000;

        const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'mousemove'];

        const activityHandler = () => {
            resetTimer();
        };

        events.forEach((event) => {
            window.addEventListener(event, activityHandler, { passive: true });
        });

        timerRef.current = setInterval(() => {
            const inactive = Date.now() - lastActivityRef.current;

            if (inactive >= timeoutMs - warningMs && !warningShownRef.current) {
                warningShownRef.current = true;
                onWarning?.();
            }

            if (inactive >= timeoutMs) {
                logout();
            }
        }, 1000);

        return () => {
            events.forEach((event) => {
                window.removeEventListener(event, activityHandler);
            });
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [timeoutMinutes, warningMinutes, resetTimer, logout, onWarning]);

    return { resetTimer };
};
