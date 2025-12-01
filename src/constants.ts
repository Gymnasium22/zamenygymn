
import { AppData, Shift } from './types';

export const DEFAULT_BELLS = [
    { shift: Shift.First, period: 1, start: "08:00", end: "08:45", day: "default" },
    { shift: Shift.First, period: 2, start: "08:55", end: "09:40", day: "default" },
    { shift: Shift.First, period: 3, start: "09:50", end: "10:35", day: "default" },
    { shift: Shift.First, period: 4, start: "10:55", end: "11:40", day: "default" },
    { shift: Shift.First, period: 5, start: "11:50", end: "12:35", day: "default" },
    { shift: Shift.First, period: 6, start: "12:40", end: "13:25", day: "default" },
    { shift: Shift.First, period: 7, start: "13:30", end: "14:15", day: "default" },
    { shift: Shift.Second, period: 0, start: "13:30", end: "14:15", day: "default" },
    { shift: Shift.Second, period: 1, start: "14:20", end: "15:05", day: "default" },
    { shift: Shift.Second, period: 2, start: "15:15", end: "16:00", day: "default" },
    { shift: Shift.Second, period: 3, start: "16:10", end: "16:55", day: "default" },
    { shift: Shift.Second, period: 4, start: "17:05", end: "17:50", day: "default" },
    { shift: Shift.Second, period: 5, start: "18:00", end: "18:45", day: "default" },
    { shift: Shift.Second, period: 6, start: "18:50", end: "19:35", day: "default" }
];

export const INITIAL_DATA: AppData = {
    subjects: [
        { id: 's1', name: 'Математика', color: '#e0e7ff', difficulty: 11, requiredRoomType: 'Обычный' },
        { id: 's2', name: 'Русский язык', color: '#dcfce7', difficulty: 10, requiredRoomType: 'Обычный' },
    ],
    teachers: [],
    classes: [
        { id: 'c1', name: '5А', shift: Shift.First, studentsCount: 25 },
        { id: 'c2', name: '6Б', shift: Shift.Second, studentsCount: 28 },
    ],
    rooms: [
        { id: 'r1', name: '101', capacity: 30, type: 'Обычный' },
    ],
    schedule: [], // 1 полугодие
    schedule2ndHalf: [], // 2 полугодие
    substitutions: [],
    bellSchedule: DEFAULT_BELLS,
    settings: {
        telegramToken: '',
        publicScheduleId: null,
        feedbackChatId: ''
    }
};
