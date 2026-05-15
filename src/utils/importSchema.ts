import { z } from 'zod';

const TeacherSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    telegramChatId: z.string().optional(),
    unavailableDates: z.array(z.string()).optional()
});

const SubjectSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    color: z.string().optional(),
    difficulty: z.number().optional(),
    requiredRoomType: z.string().optional()
});

const ClassSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    shift: z.string().optional(),
    studentsCount: z.number().optional()
});

const RoomSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    capacity: z.number().optional(),
    type: z.string().optional()
});

const ScheduleItemSchema = z.object({
    id: z.string(),
    classId: z.string().optional(),
    subjectId: z.string().optional(),
    teacherId: z.string().optional(),
    roomId: z.string().optional(),
    day: z.string().optional(),
    period: z.number().optional(),
    shift: z.string().optional()
});

const SubstitutionSchema = z.object({
    id: z.string(),
    scheduleItemId: z.string().optional(),
    originalTeacherId: z.string().optional(),
    replacementTeacherId: z.string().optional(),
    date: z.string().optional(),
    isMerger: z.boolean().optional()
});

const BellSchema = z.object({
    shift: z.string(),
    period: z.number(),
    start: z.string(),
    end: z.string(),
    day: z.string()
});

const SettingsSchema = z.record(z.string(), z.unknown()).optional();

export const AppDataImportSchema = z.object({
    teachers: z.array(TeacherSchema).optional(),
    subjects: z.array(SubjectSchema).optional(),
    classes: z.array(ClassSchema).optional(),
    rooms: z.array(RoomSchema).optional(),
    schedule: z.array(ScheduleItemSchema).optional(),
    schedule2: z.array(ScheduleItemSchema).optional(),
    substitutions: z.array(SubstitutionSchema).optional(),
    bellSchedule: z.array(BellSchema).optional(),
    settings: SettingsSchema,
    dutyZones: z.array(z.record(z.string(), z.unknown())).optional(),
    dutySchedule: z.array(z.record(z.string(), z.unknown())).optional(),
    nutritionRecords: z.array(z.record(z.string(), z.unknown())).optional(),
    absenteeismRecords: z.array(z.record(z.string(), z.unknown())).optional()
});

export type AppDataImport = z.infer<typeof AppDataImportSchema>;
