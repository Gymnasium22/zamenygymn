
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

export const SHORT_BELLS = [
    { shift: Shift.First, period: 1, start: "08:00", end: "08:35", day: "default" },
    { shift: Shift.First, period: 2, start: "08:45", end: "09:20", day: "default" },
    { shift: Shift.First, period: 3, start: "09:30", end: "10:05", day: "default" },
    { shift: Shift.First, period: 4, start: "10:15", end: "10:50", day: "default" },
    { shift: Shift.First, period: 5, start: "11:00", end: "11:35", day: "default" },
    { shift: Shift.First, period: 6, start: "11:45", end: "12:20", day: "default" },
    { shift: Shift.First, period: 7, start: "12:30", end: "13:05", day: "default" },
    { shift: Shift.Second, period: 0, start: "12:30", end: "13:05", day: "default" },
    { shift: Shift.Second, period: 1, start: "13:15", end: "13:50", day: "default" },
    { shift: Shift.Second, period: 2, start: "14:00", end: "14:35", day: "default" },
    { shift: Shift.Second, period: 3, start: "14:45", end: "15:20", day: "default" },
    { shift: Shift.Second, period: 4, start: "15:30", end: "16:05", day: "default" },
    { shift: Shift.Second, period: 5, start: "16:15", end: "16:50", day: "default" },
    { shift: Shift.Second, period: 6, start: "17:00", end: "17:35", day: "default" }
];

// Helper to generate room range array
const range = (start: number, end: number) => Array.from({length: end - start + 1}, (_, i) => String(start + i));

export const DEFAULT_DUTY_ZONES = [
    { 
        id: 'zone_2floor_1', 
        name: 'Левое крыло (28-38)',
        floor: '2 этаж',
        includedRooms: range(28, 38),
        order: 1
    },
    { 
        id: 'zone_2floor_2', 
        name: 'Правое крыло (42-44)',
        floor: '2 этаж',
        includedRooms: range(42, 44),
        order: 2
    },
    { 
        id: 'zone_3floor_1', 
        name: 'Центр (65-70)',
        floor: '3 этаж',
        includedRooms: range(65, 70),
        order: 3
    },
    { 
        id: 'zone_3floor_2', 
        name: 'Рекреация (72-75)',
        floor: '3 этаж',
        includedRooms: range(72, 75),
        order: 4
    },
    { 
        id: 'zone_3floor_3', 
        name: 'Правое крыло (78-86)',
        floor: '3 этаж',
        includedRooms: range(78, 86),
        order: 5
    }
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
    schedule2: [], // 2 полугодие
    substitutions: [],
    bellSchedule: DEFAULT_BELLS,
    dutyZones: DEFAULT_DUTY_ZONES,
    dutySchedule: [],
    settings: {
        telegramToken: '',
        publicScheduleId: null,
        feedbackChatId: '',
        bellPresets: [
            { id: 'preset_normal', name: 'Обычный (45 мин)', bells: DEFAULT_BELLS },
            { id: 'preset_short', name: 'Сокращенный (35 мин)', bells: SHORT_BELLS }
        ],
        semesterConfig: {
            firstSemesterMonths: [8, 9, 10, 11], // сентябрь-декабрь
            secondSemesterMonths: [0, 1, 2, 3, 4] // январь-май
        }
    }
};
