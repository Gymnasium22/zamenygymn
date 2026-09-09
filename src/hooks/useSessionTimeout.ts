import { useEffect, useRef, useCallback } from 'react';

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
    const timedOutRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setInterval>>();

    const resetTimer = useCallback(() => {
        lastActivityRef.current = Date.now();
        warningShownRef.current = false;
        timedOutRef.current = false;
    }, []);

    useEffect(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) {
            return;
        }

        const timeoutMs = timeoutMinutes * 60 * 1000;
        const warningMs = warningMinutes * 60 * 1000;

        const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

        const activityHandler = () => {
            resetTimer();
        };

        events.forEach((event) => {
            window.addEventListener(event, activityHandler, { passive: true });
        });

        timerRef.current = setInterval(() => {
            const inactive = Date.now() - lastActivityRef.current;

            if (inactive >= timeoutMs - warningMs && !warningShownRef.current && !timedOutRef.current) {
                warningShownRef.current = true;
                onWarning?.();
            }

            if (inactive >= timeoutMs && !timedOutRef.current) {
                timedOutRef.current = true;
                onTimeout?.();
            }
        }, 30000);

        return () => {
            events.forEach((event) => {
                window.removeEventListener(event, activityHandler);
            });
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [timeoutMinutes, warningMinutes, resetTimer, onWarning, onTimeout]);

    return { resetTimer };
};
