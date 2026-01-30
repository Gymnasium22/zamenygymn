
export enum Shift {
  First = '1 смена',
  Second = '2 смена'
}

export enum DayOfWeek {
  Monday = 'Пн',
  Tuesday = 'Вт',
  Wednesday = 'Ср',
  Thursday = 'Чт',
  Friday = 'Пт'
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  difficulty: number;
  requiredRoomType: string;
  order?: number;
}

export interface Teacher {
  id: string;
  name: string;
  subjectIds: string[];
  unavailableDates: string[]; // ISO Date strings
  absenceReasons?: Record<string, string>;
  shifts: string[]; // Shift values
  birthDate?: string;
  telegramChatId?: string;
  order?: number;
}

export interface ClassEntity {
  id: string;
  name: string;
  shift: string; // Shift enum
  studentsCount: number;
  order?: number;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  type: string;
  order?: number;
}

export interface ScheduleItem {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string;
  day: string; // DayOfWeek
  period: number;
  shift: string; // Shift
  direction?: string; // Group or profile
}

export interface Substitution {
  id: string;
  date: string; // ISO Date
  scheduleItemId: string;
  originalTeacherId: string;
  replacementTeacherId: string; // 'conducted', 'cancelled', or teacherId. If purely room change, can be originalTeacherId
  replacementRoomId?: string; // New field for room substitution
  lessonAbsenceReason?: string; // NEW: Reason for lesson-specific absence
  isMerger?: boolean; // NEW: Flag for merged classes
  refusals?: string[]; // IDs of teachers who refused
  replacementClassId?: string; // NEW: For swapping lessons (target class)
  replacementSubjectId?: string; // NEW: For swapping lessons (target subject)
}

export interface Bell {
  shift: string;
  period: number;
  start: string;
  end: string;
  day: string; // 'default' or DayOfWeek
  cancelled?: boolean; // New field
}

export interface BellPreset {
    id: string;
    name: string;
    bells: Bell[];
}

export interface Settings {
  telegramToken: string;
  publicScheduleId?: string | null; // ID for publicly published schedule
  feedbackChatId?: string;
  bellPresets?: BellPreset[];
}

// --- NEW DUTY TYPES ---
export interface DutyZone {
    id: string;
    name: string;
    description?: string;
    includedRooms: string[]; // Array of room names/numbers as strings
    order?: number;
    floor?: string; // Added optional floor property
}

export interface DutyRecord {
    id: string;
    day: string; // DayOfWeek
    shift: string; // Shift enum (Added for 2 shifts support)
    zoneId: string;
    teacherId: string;
}

// Interfaces for split contexts
export interface StaticAppData {
  subjects: Subject[];
  teachers: Teacher[];
  classes: ClassEntity[];
  rooms: Room[];
  bellSchedule: Bell[];
  settings: Settings;
  dutyZones: DutyZone[]; // New
}

export interface ScheduleAndSubstitutionData {
  schedule: ScheduleItem[]; // АВТОМАТИЧЕСКИ ВЫБРАННОЕ ТЕКУЩЕЕ РАСПИСАНИЕ (зависит от месяца)
  schedule1: ScheduleItem[]; // Явное 1 полугодие
  schedule2: ScheduleItem[]; // Явное 2 полугодие
  substitutions: Substitution[];
  dutySchedule: DutyRecord[]; // New
  saveSemesterSchedule: (semester: 1 | 2, newData: ScheduleItem[]) => Promise<void>;
  saveScheduleData: (newData: Partial<ScheduleAndSubstitutionData>, addToHistory?: boolean) => Promise<void>; // Legacy support
}

export interface AppData extends StaticAppData {
    schedule: ScheduleItem[]; // 1 полугодие
    schedule2ndHalf: ScheduleItem[]; // 2 полугодие
    substitutions: Substitution[];
    dutySchedule: DutyRecord[]; // New
}

export const DAYS = [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday];
export const SHIFT_PERIODS = { [Shift.First]: [1, 2, 3, 4, 5, 6, 7], [Shift.Second]: [0, 1, 2, 3, 4, 5, 6] };
export const ROOM_TYPES = ['Обычный', 'Спортзал', 'Химия/Биология', 'Физика', 'Информатика', 'Музыка', 'Технология', 'Актовый зал'];
