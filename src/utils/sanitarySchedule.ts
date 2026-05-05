import { DAYS, DayOfWeek, ScheduleItem, Subject } from '../types';

type SlotKey = string;

export type SanitaryRuleViolation =
    | { type: 'heavy_first_or_last_more_than_once'; classId: string; position: 'first' | 'last'; count: number }
    | { type: 'heavy_consecutive'; classId: string; day: string; period: number; count: number } // count: сколько тяжёлых подряд
    | { type: 'peak_day_not_on_recommended'; classId: string; peakDay: string; recommendedDays: string[] }
    | { type: 'unknown_subject_difficulty'; classId: string; subjectName: string }
    | { type: 'gap_window'; classId: string; day: string; period: number } // Форточка
    | { type: 'duplicate_subject_same_day'; classId: string; day: string; subjectName: string } // Два одинаковых предмета в день
    | { type: 'pe_load_pattern'; classId: string; description: string } // Нарушение паттерна физкультуры
    | { type: 'profile_class_subject_limit'; classId: string; subjectName: string; count: number } // Превышение лимита предметов в профильном классе
    | { type: 'weekly_load_imbalance'; classId: string; expected: number; actual: number }; // Дисбаланс недельной нагрузки

export interface SanitaryAnalysis {
    classId: string;
    dayLoad: Record<string, number>;
    peakDay: string;
    violations: SanitaryRuleViolation[];
    heavyFirstCount: number;
    heavyLastCount: number;
}

export interface SanitaryResult {
    schedule: ScheduleItem[];
    analysisByClassId: Record<string, SanitaryAnalysis>;
    swapsApplied: number;
}

const DEFAULT_UNKNOWN_DIFFICULTY = 6; // ближе к "середине", чтобы не занижать нагрузку

// Важно: используем "вхождения", как в твоём примере, а не строгие совпадения.
// Шкала трудности согласно требованиям санстанции
const DIFFICULTY_BY_SUBJECT_NAME: Array<[RegExp, number]> = [
    [/математ|алгебр|геометр/i, 12], // Математика
    [/иностранн|английск|немецк|французск|испанск/i, 11], // Иностранный язык
    [/русск(ий|ого)?\s+язык|рус\.?\s*яз/i, 10], // Русский язык
    [/белорусск(ий|ого)?\s+язык|бел\.?\s*яз/i, 10], // Белорусский язык
    [/национального\s+меньшинства/i, 10], // Язык национального меньшинства
    [/физик/i, 9], // Физика
    [/хими/i, 9], // Химия
    [/информатик/i, 8], // Информатика
    [/астроном/i, 8], // Астрономия
    [/биолог/i, 8], // Биология
    [/всемирн.*истор/i, 7], // Всемирная история
    [/история\s+беларуси/i, 7], // История Беларуси
    [/обществовед/i, 7], // Обществоведение
    [/белорусск\w*\s+литератур/i, 6], // Белорусская литература
    [/русск\w*\s+литератур/i, 6], // Русская литература
    [/литература\s+национального\s+меньшинства/i, 6], // Литература национального меньшинства
    [/географ/i, 6], // География
    [/человек\s+и\s+мир/i, 5], // Человек и мир
    [/искусств|отечественная\s+и\s+мировая\s+художественная\s+культура|мхк/i, 4], // Искусство (ОМХК)
    [/основы\s+безопасности\s+жизнедеятельности|обж/i, 4], // ОБЖ
    [/черчен/i, 4], // Черчение
    [/труд|технолог|трудовое\s+обучение/i, 4], // Трудовое обучение
    [/физкультур\s+и\s+здоров|физическая\s+культура\s+и\s+здоровье/i, 3], // Физическая культура и здоровье
    [/допризывн|медицинск\s+подготов/i, 3] // Допризывная и медицинская подготовка
];

const HEAVY_SUBJECT_NAME_PATTERNS: RegExp[] = [
    /математ|алгебр|геометр/i,
    /(русск(ий|ого)?\s+язык|рус\.?\s*яз)/i,
    /(белорусск(ий|ого)?\s+язык|бел\.?\s*яз)/i,
    /национального\s+меньшинства/i,
    /иностранн|английск|немецк|французск|испанск/i,
    /физик/i,
    /хими/i
];

function normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').replace(/[.]/g, '').toLowerCase();
}

function getGradeNumber(className: string): number | null {
    const m = className.trim().match(/^(\d{1,2})/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
}

function isVtoXI(grade: number | null): boolean {
    if (grade == null) return true;
    return grade >= 5;
}

function isVItoXI(grade: number | null): boolean {
    if (grade == null) return true;
    return grade >= 6;
}

function subjectDifficulty(subject: Subject | undefined, subjectNameFallback: string | undefined): number {
    const fromModel = subject?.difficulty;
    if (typeof fromModel === 'number' && Number.isFinite(fromModel) && fromModel > 0) return fromModel;

    const name = normalizeName(subject?.name || subjectNameFallback || '');
    if (!name) return DEFAULT_UNKNOWN_DIFFICULTY;
    for (const [re, score] of DIFFICULTY_BY_SUBJECT_NAME) {
        if (re.test(name)) return score;
    }
    return DEFAULT_UNKNOWN_DIFFICULTY;
}

function isHeavySubject(
    subject: Subject | undefined,
    subjectNameFallback: string | undefined,
    grade: number | null
): boolean {
    const name = normalizeName(subject?.name || subjectNameFallback || '');
    // Физика/химия требуются как "тяжёлые" по тексту для VI–XI
    const isPhysChem = /физик|хими/i.test(name);
    if (isPhysChem) return isVItoXI(grade);
    if (!isVtoXI(grade)) return false;
    return HEAVY_SUBJECT_NAME_PATTERNS.some((re) => re.test(name));
}

function slotKeyOf(item: Pick<ScheduleItem, 'classId' | 'day' | 'shift' | 'period'>): SlotKey {
    return `${item.classId}__${item.shift}__${item.day}__${item.period}`;
}

function buildSlotMap(items: ScheduleItem[]): Map<SlotKey, ScheduleItem[]> {
    const map = new Map<SlotKey, ScheduleItem[]>();
    for (const it of items) {
        const key = slotKeyOf(it);
        const arr = map.get(key) || [];
        arr.push(it);
        map.set(key, arr);
    }
    return map;
}

function flattenSlotMap(map: Map<SlotKey, ScheduleItem[]>): ScheduleItem[] {
    const out: ScheduleItem[] = [];
    for (const arr of map.values()) out.push(...arr);
    return out;
}

function swapSlots(map: Map<SlotKey, ScheduleItem[]>, keyA: SlotKey, keyB: SlotKey) {
    const a = map.get(keyA) || [];
    const b = map.get(keyB) || [];
    map.set(
        keyA,
        b.map((x) => ({ ...x, day: parseKey(keyA).day, period: parseKey(keyA).period }))
    );
    map.set(
        keyB,
        a.map((x) => ({ ...x, day: parseKey(keyB).day, period: parseKey(keyB).period }))
    );
}

function parseKey(key: SlotKey): { classId: string; shift: string; day: string; period: number } {
    const [classId, shift, day, periodStr] = key.split('__');
    return { classId, shift, day, period: Number(periodStr) };
}

function analyzeClassSchedule(params: {
    classId: string;
    className: string;
    shift: string;
    periods: number[];
    slotMap: Map<SlotKey, ScheduleItem[]>;
    subjectsById: Map<string, Subject>;
}): SanitaryAnalysis {
    const { classId, className, shift, periods, slotMap, subjectsById } = params;
    const grade = getGradeNumber(className);
    const recommendedPeakDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday];
    const isProfileClass = grade === 10 || grade === 11;

    const dayLoad: Record<string, number> = Object.fromEntries(DAYS.map((d) => [d, 0]));
    const violations: SanitaryRuleViolation[] = [];

    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];

    let heavyFirstCount = 0;
    let heavyLastCount = 0;

    // Предметы, которые не должны дублироваться в один день
    const noDuplicateSubjects = [
        'русский язык',
        'рус. язык',
        'белорусский язык',
        'бел. язык',
        'белорусская литература',
        'русская литература'
    ];

    // Предметы с лимитом для профильных классов (не более 2 в неделю)
    const profileSubjectLimit: { pattern: RegExp; limit: number }[] = [
        { pattern: /математ|алгебр|геометр/i, limit: 2 },
        { pattern: /физик/i, limit: 2 },
        { pattern: /хими/i, limit: 2 },
        { pattern: /биолог/i, limit: 2 },
        { pattern: /иностранн|английск/i, limit: 2 }
    ];

    // Подсчёт предметов по дням и за неделю
    const subjectCountByDay: Record<string, Record<string, number>> = {};
    const subjectCountWeek: Record<string, number> = {};
    const peLessons: Array<{ day: string; period: number; name: string }> = [];

    for (const day of DAYS) {
        subjectCountByDay[day] = {};

        for (const period of periods) {
            const key = `${classId}__${shift}__${day}__${period}`;
            const slot = slotMap.get(key) || [];
            for (const it of slot) {
                const subj = subjectsById.get(it.subjectId);
                const subjName = subj?.name || '';
                const diff = subjectDifficulty(subj, undefined);
                dayLoad[day] += diff;

                // Подсчёт предметов
                subjectCountByDay[day][subjName] = (subjectCountByDay[day][subjName] || 0) + 1;
                subjectCountWeek[subjName] = (subjectCountWeek[subjName] || 0) + 1;

                // Проверка на тяжёлые предметы на первом/последнем месте
                const heavy = isHeavySubject(subj, undefined, grade);
                if (heavy && period === firstPeriod) heavyFirstCount++;
                if (heavy && period === lastPeriod) heavyLastCount++;

                // Сбор уроков физкультуры
                if (/физкультур|физическая\s+культура/i.test(subjName)) {
                    peLessons.push({ day, period, name: subjName });
                }
            }
        }
    }

    // === 1. Проверка: не более 2 тяжёлых предметов подряд ===
    for (const day of DAYS) {
        let consecutiveHeavy = 0;
        let maxConsecutive = 0;
        let consecutiveStartPeriod = 0;

        for (const period of periods) {
            const key = `${classId}__${shift}__${day}__${period}`;
            const slot = slotMap.get(key) || [];
            const hasHeavy = slot.some((it) => isHeavySubject(subjectsById.get(it.subjectId), undefined, grade));

            if (hasHeavy) {
                if (consecutiveHeavy === 0) consecutiveStartPeriod = period;
                consecutiveHeavy++;
                maxConsecutive = Math.max(maxConsecutive, consecutiveHeavy);
            } else {
                consecutiveHeavy = 0;
            }
        }

        if (maxConsecutive > 2) {
            violations.push({
                type: 'heavy_consecutive',
                classId,
                day,
                period: consecutiveStartPeriod + 2,
                count: maxConsecutive
            });
        }
    }

    // === 2. Проверка: дублирование предметов в один день ===
    for (const day of DAYS) {
        for (const [subjName, count] of Object.entries(subjectCountByDay[day])) {
            const normalizedSubj = subjName.toLowerCase();
            if (noDuplicateSubjects.some((s) => normalizedSubj.includes(s)) && count > 1) {
                violations.push({ type: 'duplicate_subject_same_day', classId, day, subjectName: subjName });
            }
        }
    }

    // === 3. Проверка: лимит предметов в профильных классах ===
    if (isProfileClass) {
        for (const [subjName, count] of Object.entries(subjectCountWeek)) {
            for (const { pattern, limit } of profileSubjectLimit) {
                if (pattern.test(subjName) && count > limit) {
                    violations.push({ type: 'profile_class_subject_limit', classId, subjectName: subjName, count });
                }
            }
        }
    }

    // === 4. Проверка: паттерн физкультуры (между двумя физкультурами должна быть ещё одна) ===
    if (peLessons.length >= 2) {
        // Сортируем уроки физкультуры по дням и периодам
        const peByDay: Record<string, number[]> = {};
        peLessons.forEach((pe) => {
            if (!peByDay[pe.day]) peByDay[pe.day] = [];
            peByDay[pe.day].push(pe.period);
        });

        // Если в один день 2 урока физкультуры без третьего между ними
        for (const [day, periods] of Object.entries(peByDay)) {
            if (periods.length === 2) {
                const [p1, p2] = periods.sort((a, b) => a - b);
                // Проверить, есть ли физкультура между ними
                const hasPeBetween = Array.from({ length: p2 - p1 - 1 }, (_, i) => p1 + 1 + i).some((p) => {
                    const key = `${classId}__${shift}__${day}__${p}`;
                    const slot = slotMap.get(key) || [];
                    return slot.some((it) => /физкультур/i.test(subjectsById.get(it.subjectId)?.name || ''));
                });

                if (!hasPeBetween && p2 - p1 <= 3) {
                    // Нет физкультуры между ними и они близко
                    violations.push({
                        type: 'pe_load_pattern',
                        classId,
                        description: `В ${day} два урока физкультуры (${p1} и ${p2}) без промежуточного`
                    });
                }
            }
        }
    }

    // === 5. Проверка на форточки (окна между уроками) ===
    for (const day of DAYS) {
        for (let i = 1; i < periods.length - 1; i++) {
            const period = periods[i];
            const key = `${classId}__${shift}__${day}__${period}`;
            const slot = slotMap.get(key) || [];
            if (slot.length === 0) {
                const hasLessonsBefore = periods
                    .slice(0, i)
                    .some((p) => (slotMap.get(`${classId}__${shift}__${day}__${p}`) || []).length > 0);
                const hasLessonsAfter = periods
                    .slice(i + 1)
                    .some((p) => (slotMap.get(`${classId}__${shift}__${day}__${p}`) || []).length > 0);
                if (hasLessonsBefore && hasLessonsAfter) {
                    violations.push({ type: 'gap_window', classId, day, period });
                }
            }
        }
    }

    // === 6. Peak day ===
    let peakDay = DAYS[0];
    for (const d of DAYS) {
        if ((dayLoad[d] ?? 0) > (dayLoad[peakDay] ?? 0)) peakDay = d;
    }

    // Проверка: пик должен быть во Вт/Ср/Пт
    if (!recommendedPeakDays.includes(peakDay as DayOfWeek) && isVtoXI(grade)) {
        violations.push({
            type: 'peak_day_not_on_recommended',
            classId,
            peakDay,
            recommendedDays: recommendedPeakDays
        });
    }

    // === 7. Проверка: паттерн нагрузки (рост к среде, спад в чт, подъём в пт) ===
    if (isVtoXI(grade)) {
        const wedLoad = dayLoad[DayOfWeek.Wednesday] ?? 0;
        const thuLoad = dayLoad[DayOfWeek.Thursday] ?? 0;
        const friLoad = dayLoad[DayOfWeek.Friday] ?? 0;
        const monLoad = dayLoad[DayOfWeek.Monday] ?? 0;
        const tueLoad = dayLoad[DayOfWeek.Tuesday] ?? 0;

        // Среда должна быть одним из самых высоких
        const maxLoad = Math.max(monLoad, tueLoad, wedLoad, thuLoad, friLoad);
        if (wedLoad < maxLoad * 0.85) {
            // Среда меньше 85% от максимума
            violations.push({
                type: 'peak_day_not_on_recommended',
                classId,
                peakDay,
                recommendedDays: recommendedPeakDays
            });
        }

        // Четверг должен быть легче среды
        if (thuLoad > wedLoad && wedLoad > 0) {
            violations.push({
                type: 'peak_day_not_on_recommended',
                classId,
                peakDay,
                recommendedDays: recommendedPeakDays
            });
        }
    }

    // === 8. Heavy on first/last more than once ===
    if (heavyFirstCount > 1 && isVtoXI(grade)) {
        violations.push({
            type: 'heavy_first_or_last_more_than_once',
            classId,
            position: 'first',
            count: heavyFirstCount
        });
    }
    if (heavyLastCount > 1 && isVtoXI(grade)) {
        violations.push({
            type: 'heavy_first_or_last_more_than_once',
            classId,
            position: 'last',
            count: heavyLastCount
        });
    }

    return { classId, dayLoad, peakDay, violations, heavyFirstCount, heavyLastCount };
}

function classPenalty(params: {
    classId: string;
    className: string;
    shift: string;
    periods: number[];
    slotMap: Map<SlotKey, ScheduleItem[]>;
    subjectsById: Map<string, Subject>;
}): number {
    const { classId, className, shift, periods, slotMap, subjectsById } = params;
    const grade = getGradeNumber(className);
    const analysis = analyzeClassSchedule(params);
    const v = analysis.violations;

    // Base penalties from violations - увеличенные штрафы для критических нарушений
    let penalty = 0;
    for (const viol of v) {
        if (viol.type === 'heavy_first_or_last_more_than_once') penalty += 5000 * viol.count;
        if (viol.type === 'heavy_consecutive') penalty += 1500 * viol.count; // Увеличено за >2 тяжёлых подряд
        if (viol.type === 'peak_day_not_on_recommended') penalty += 1500;
        if (viol.type === 'gap_window') penalty += 3000; // Форточки
        if (viol.type === 'duplicate_subject_same_day') penalty += 2000; // Дубли предметов
        if (viol.type === 'profile_class_subject_limit') penalty += 3000 * (viol.count - 2); // Превышение лимита
        if (viol.type === 'pe_load_pattern') penalty += 1500; // Паттерн физкультуры
    }

    // Критическое нарушение: если пик не во Вт/Ср/Пт для V-XI классов
    if (isVtoXI(grade)) {
        const recommendedPeakDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday];
        if (!recommendedPeakDays.includes(analysis.peakDay as DayOfWeek)) {
            penalty += 2000;
        }

        // Паттерн: рост к среде, спад в чт, подъём в пт
        const wedLoad = analysis.dayLoad[DayOfWeek.Wednesday] ?? 0;
        const thuLoad = analysis.dayLoad[DayOfWeek.Thursday] ?? 0;
        const friLoad = analysis.dayLoad[DayOfWeek.Friday] ?? 0;

        if (thuLoad > wedLoad && wedLoad > 0) {
            penalty += (thuLoad - wedLoad) * 500 + 1000; // Четверг тяжелее среды
        }

        // Пятница должна быть достаточно нагружена
        if (friLoad < wedLoad * 0.7 && wedLoad > 0) {
            penalty += (wedLoad - friLoad) * 300;
        }
    }

    // === НОВОЕ: Штраф за форточки (окна между уроками) ===
    for (const day of DAYS) {
        const daySlots = periods.map((p) => ({
            period: p,
            key: `${classId}__${shift}__${day}__${p}`,
            hasLesson: (slotMap.get(`${classId}__${shift}__${day}__${p}`) || []).length > 0
        }));

        for (let i = 1; i < daySlots.length - 1; i++) {
            if (!daySlots[i].hasLesson) {
                const hasLessonsBefore = daySlots.slice(0, i).some((s) => s.hasLesson);
                const hasLessonsAfter = daySlots.slice(i + 1).some((s) => s.hasLesson);
                if (hasLessonsBefore && hasLessonsAfter) {
                    penalty += 3000;
                }
            }
        }
    }

    // === НОВОЕ: Штраф за дублирование предметов в один день ===
    for (const day of DAYS) {
        const subjectCount: Record<string, number> = {};
        for (const period of periods) {
            const key = `${classId}__${shift}__${day}__${period}`;
            const slot = slotMap.get(key) || [];
            for (const it of slot) {
                const subj = subjectsById.get(it.subjectId);
                const subjName = subj?.name.toLowerCase() || '';
                subjectCount[subjName] = (subjectCount[subjName] || 0) + 1;
            }
        }

        const noDuplicateSubjects = [
            'русский язык',
            'рус. язык',
            'белорусский язык',
            'бел. язык',
            'белорусская литература',
            'русская литература'
        ];
        for (const [subjName, count] of Object.entries(subjectCount)) {
            if (noDuplicateSubjects.some((s) => subjName.includes(s)) && count > 1) {
                penalty += 2000 * (count - 1);
            }
        }
    }

    // Soft: heavy should prefer 2-4, avoid first/last even if within weekly limit
    if (isVtoXI(grade)) {
        const first = periods[0];
        const last = periods[periods.length - 1];
        for (const day of DAYS) {
            for (const period of periods) {
                const key = `${classId}__${shift}__${day}__${period}`;
                const slot = slotMap.get(key) || [];
                const hasHeavy = slot.some((it) => isHeavySubject(subjectsById.get(it.subjectId), undefined, grade));
                if (!hasHeavy) continue;
                if (period === first || period === last) penalty += 200;
                if (period < 2 || period > 4) penalty += 80;
                if (period >= 2 && period <= 4) penalty -= 50;
            }
        }
    }

    // Balance day loads (variance) - более сильный штраф за дисбаланс
    const loads = DAYS.map((d) => analysis.dayLoad[d] ?? 0);
    const mean = loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length);
    const variance = loads.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / Math.max(1, loads.length);
    penalty += variance * 2.5;

    // Сильнее:确保 Вт/Ср/Пт не легче Пн/Чт (V–XI)
    if (isVtoXI(grade)) {
        const high = [
            analysis.dayLoad[DayOfWeek.Tuesday] ?? 0,
            analysis.dayLoad[DayOfWeek.Wednesday] ?? 0,
            analysis.dayLoad[DayOfWeek.Friday] ?? 0
        ];
        const low = [analysis.dayLoad[DayOfWeek.Monday] ?? 0, analysis.dayLoad[DayOfWeek.Thursday] ?? 0];
        const minHigh = Math.min(...high);
        const maxLow = Math.max(...low);
        if (maxLow > minHigh) {
            penalty += (maxLow - minHigh) * 100 + 1500;
        }
        for (const lowDay of [DayOfWeek.Monday, DayOfWeek.Thursday]) {
            for (const highDay of [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday]) {
                if ((analysis.dayLoad[lowDay] ?? 0) > (analysis.dayLoad[highDay] ?? 0)) {
                    penalty += 300;
                }
            }
        }
    }

    // Дополнительный штраф за несколько consecutive heavy в один день
    if (isVtoXI(grade)) {
        for (const day of DAYS) {
            let consecutiveHeavy = 0;
            let maxConsecutive = 0;
            for (const period of periods) {
                const key = `${classId}__${shift}__${day}__${period}`;
                const slot = slotMap.get(key) || [];
                const hasHeavy = slot.some((it) => isHeavySubject(subjectsById.get(it.subjectId), undefined, grade));
                if (hasHeavy) {
                    consecutiveHeavy++;
                    maxConsecutive = Math.max(maxConsecutive, consecutiveHeavy);
                } else {
                    consecutiveHeavy = 0;
                }
            }
            if (maxConsecutive > 2) {
                penalty += (maxConsecutive - 2) * 2000; // Увеличенный штраф за >2 тяжёлых подряд
            }
        }
    }

    return penalty;
}

export function analyzeSanitarySchedule(params: {
    schedule: ScheduleItem[];
    subjects: Subject[];
    classes: Array<{ id: string; name: string; shift: string }>;
    periodsByShift: Record<string, number[]>;
}): Record<string, SanitaryAnalysis> {
    const { schedule, subjects, classes, periodsByShift } = params;
    const subjectsById = new Map(subjects.map((s) => [s.id, s]));
    const byClass = new Map<string, ScheduleItem[]>();
    for (const it of schedule) {
        const arr = byClass.get(it.classId) || [];
        arr.push(it);
        byClass.set(it.classId, arr);
    }
    const analysisByClassId: Record<string, SanitaryAnalysis> = {};
    for (const cls of classes) {
        const periods = periodsByShift[cls.shift] || [];
        const clsItems = byClass.get(cls.id) || [];
        const slotMap = buildSlotMap(clsItems);
        analysisByClassId[cls.id] = analyzeClassSchedule({
            classId: cls.id,
            className: cls.name,
            shift: cls.shift,
            periods,
            slotMap,
            subjectsById
        });
    }
    return analysisByClassId;
}

export function generateSanitarySchedule(params: {
    baseSchedule: ScheduleItem[];
    subjects: Subject[];
    classes: Array<{ id: string; name: string; shift: string }>;
    periodsByShift: Record<string, number[]>;
    maxIterations?: number;
    maxSwaps?: number;
    enforceTeacherConflicts?: boolean;
}): SanitaryResult {
    const {
        baseSchedule,
        subjects,
        classes,
        periodsByShift,
        maxIterations = 100000, // Увеличено по умолчанию
        maxSwaps = 1500, // Увеличено по умолчанию
        enforceTeacherConflicts = false // Отключено по умолчанию для санстанции
    } = params;

    const subjectsById = new Map(subjects.map((s) => [s.id, s]));
    const resultItems = baseSchedule.map((x) => ({ ...x })); // never mutate source

    type TeacherSlotKey = string;
    const teacherSlotKey = (teacherId: string, shift: string, day: string, period: number): TeacherSlotKey =>
        `${teacherId}__${shift}__${day}__${period}`;

    const buildTeacherOccupancy = (items: ScheduleItem[], excludeClassId?: string) => {
        const occ = new Map<TeacherSlotKey, number>();
        for (const it of items) {
            if (excludeClassId && it.classId === excludeClassId) continue;
            const key = teacherSlotKey(it.teacherId, it.shift, it.day, it.period);
            occ.set(key, (occ.get(key) || 0) + 1);
        }
        return occ;
    };

    const canMoveSlotWithoutTeacherConflicts = (params: {
        occupancy: Map<TeacherSlotKey, number>;
        fromLessons: ScheduleItem[];
        toLessons: ScheduleItem[];
        from: { shift: string; day: string; period: number };
        to: { shift: string; day: string; period: number };
    }) => {
        if (!enforceTeacherConflicts) return true; // Всегда разрешаем, если учителя не учитываются
        const { occupancy, fromLessons, toLessons, from, to } = params;
        for (const it of fromLessons) {
            const key = teacherSlotKey(it.teacherId, to.shift, to.day, to.period);
            if ((occupancy.get(key) || 0) > 0) return false;
        }
        for (const it of toLessons) {
            const key = teacherSlotKey(it.teacherId, from.shift, from.day, from.period);
            if ((occupancy.get(key) || 0) > 0) return false;
        }
        return true;
    };

    const byClassId = new Map<string, ScheduleItem[]>();
    for (const it of resultItems) {
        const arr = byClassId.get(it.classId) || [];
        arr.push(it);
        byClassId.set(it.classId, arr);
    }

    const analysisByClassId: Record<string, SanitaryAnalysis> = {};
    let totalSwapsApplied = 0;

    for (const cls of classes) {
        const clsItems = byClassId.get(cls.id) || [];
        const periods = periodsByShift[cls.shift] || [];
        if (periods.length === 0) {
            analysisByClassId[cls.id] = {
                classId: cls.id,
                dayLoad: Object.fromEntries(DAYS.map((d) => [d, 0])),
                peakDay: DAYS[0],
                violations: [],
                heavyFirstCount: 0,
                heavyLastCount: 0
            };
            continue;
        }

        const slotMap = buildSlotMap(clsItems);
        const teacherOccOtherClasses = enforceTeacherConflicts
            ? buildTeacherOccupancy(resultItems, cls.id)
            : new Map<TeacherSlotKey, number>();

        let currentPenalty = classPenalty({
            classId: cls.id,
            className: cls.name,
            shift: cls.shift,
            periods,
            slotMap,
            subjectsById
        });

        const allKeys: SlotKey[] = [];
        for (const day of DAYS) {
            for (const period of periods) {
                allKeys.push(`${cls.id}__${cls.shift}__${day}__${period}`);
            }
        }

        // --- Phase 1: targeted fixes (fast, deterministic) ---
        const firstP = periods[0];
        const lastP = periods[periods.length - 1];
        const preferred = periods.filter((p) => p >= 2 && p <= 4);
        const preferredDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday];

        const trySwap = (keyA: SlotKey, keyB: SlotKey): boolean => {
            const a = slotMap.get(keyA) || [];
            const b = slotMap.get(keyB) || [];
            if (a.length === 0 && b.length === 0) return false;
            const parsedA = parseKey(keyA);
            const parsedB = parseKey(keyB);
            if (
                !canMoveSlotWithoutTeacherConflicts({
                    occupancy: teacherOccOtherClasses,
                    fromLessons: a,
                    toLessons: b,
                    from: { shift: parsedA.shift, day: parsedA.day, period: parsedA.period },
                    to: { shift: parsedB.shift, day: parsedB.day, period: parsedB.period }
                })
            ) {
                return false;
            }
            const before = currentPenalty;
            swapSlots(slotMap, keyA, keyB);
            const after = classPenalty({
                classId: cls.id,
                className: cls.name,
                shift: cls.shift,
                periods,
                slotMap,
                subjectsById
            });
            if (after < before) {
                // Строгое неравенство для лучшего поиска
                currentPenalty = after;
                totalSwapsApplied++;
                return true;
            }
            swapSlots(slotMap, keyA, keyB);
            return false;
        };

        const grade = getGradeNumber(cls.name);
        const hasHeavyInSlot = (key: SlotKey) => {
            const slot = slotMap.get(key) || [];
            return slot.some((it) => isHeavySubject(subjectsById.get(it.subjectId), undefined, grade));
        };

        // Reduce heavy on first/last (keep <= 1 per week) - агрессивная фаза
        for (let pass = 0; pass < 25; pass++) {
            const analysisTmp = analyzeClassSchedule({
                classId: cls.id,
                className: cls.name,
                shift: cls.shift,
                periods,
                slotMap,
                subjectsById
            });
            if (analysisTmp.heavyFirstCount <= 1 && analysisTmp.heavyLastCount <= 1) break;

            for (const day of DAYS) {
                const firstKey = `${cls.id}__${cls.shift}__${day}__${firstP}`;
                const lastKey = `${cls.id}__${cls.shift}__${day}__${lastP}`;

                const maybeFix = (badKey: SlotKey) => {
                    if (!hasHeavyInSlot(badKey)) return;
                    // Сначала пробуем preferred дни (Вт, Ср, Пт) на preferred позициях (2-4)
                    for (const d2 of preferredDays) {
                        for (const p2 of preferred) {
                            const goodKey = `${cls.id}__${cls.shift}__${d2}__${p2}`;
                            if (hasHeavyInSlot(goodKey)) continue;
                            if (trySwap(badKey, goodKey)) return;
                        }
                    }
                    // Затем любые другие позиции
                    for (const d2 of DAYS) {
                        for (const p2 of periods) {
                            const goodKey = `${cls.id}__${cls.shift}__${d2}__${p2}`;
                            if (goodKey === badKey) continue;
                            if (hasHeavyInSlot(goodKey)) continue;
                            if (trySwap(badKey, goodKey)) return;
                        }
                    }
                };

                if (analysisTmp.heavyFirstCount > 1) maybeFix(firstKey);
                if (analysisTmp.heavyLastCount > 1) maybeFix(lastKey);
            }
        }

        // --- Phase 1.5: Eliminate gaps (форточки) - новая фаза ===
        // Форточка - это пустой период между двумя заполненными
        for (let pass = 0; pass < 20; pass++) {
            let hasGap = false;
            let gapDay: string | null = null;
            let gapPeriod: number | null = null;

            // Найти первую форточку
            for (const day of DAYS) {
                for (let i = 1; i < periods.length - 1; i++) {
                    const period = periods[i];
                    const key = `${cls.id}__${cls.shift}__${day}__${period}`;
                    const slot = slotMap.get(key) || [];
                    if (slot.length === 0) {
                        // Проверить, есть ли уроки до и после
                        const hasLessonsBefore = periods
                            .slice(0, i)
                            .some((p) => (slotMap.get(`${cls.id}__${cls.shift}__${day}__${p}`) || []).length > 0);
                        const hasLessonsAfter = periods
                            .slice(i + 1)
                            .some((p) => (slotMap.get(`${cls.id}__${cls.shift}__${day}__${p}`) || []).length > 0);
                        if (hasLessonsBefore && hasLessonsAfter) {
                            hasGap = true;
                            gapDay = day;
                            gapPeriod = period;
                            break;
                        }
                    }
                }
                if (hasGap) break;
            }

            if (!hasGap) break; // Форточек нет, выходим

            // Найти урок, который можно переместить в форточку
            // Ищем урок в том же дне на последнем месте или в другом дне
            let foundSource: SlotKey | null = null;

            // Сначала пробуем найти урок в том же дне (последний урок)
            if (gapDay && gapPeriod) {
                for (let i = periods.length - 1; i >= 0; i--) {
                    const p = periods[i];
                    if (p === gapPeriod) continue;
                    const key = `${cls.id}__${cls.shift}__${gapDay}__${p}`;
                    const slot = slotMap.get(key) || [];
                    if (slot.length > 0) {
                        // Проверить, не создаст ли перемещение новую форточку
                        const hasLessonsBefore = periods
                            .slice(0, i)
                            .some((pp) => (slotMap.get(`${cls.id}__${cls.shift}__${gapDay}__${pp}`) || []).length > 0);
                        if (!hasLessonsBefore) {
                            // Перемещение не создаст новую форточку
                            foundSource = key;
                            break;
                        }
                    }
                }
            }

            // Если не нашли в том же дне, ищем в других днях
            if (!foundSource && gapDay && gapPeriod) {
                for (const day of DAYS) {
                    if (day === gapDay) continue;
                    for (const period of periods) {
                        const key = `${cls.id}__${cls.shift}__${day}__${period}`;
                        const slot = slotMap.get(key) || [];
                        if (slot.length > 0) {
                            // Проверить, не создаст ли перемещение форточку в исходном дне
                            const daySlots = periods.map((p) => ({
                                p,
                                hasLesson:
                                    p === period
                                        ? false
                                        : (slotMap.get(`${cls.id}__${cls.shift}__${day}__${p}`) || []).length > 0
                            }));
                            const idx = daySlots.findIndex((s) => s.p === period);
                            const hasLessonsBefore = daySlots.slice(0, idx).some((s) => s.hasLesson);
                            const hasLessonsAfter = daySlots.slice(idx + 1).some((s) => s.hasLesson);
                            if (!hasLessonsBefore || !hasLessonsAfter) {
                                // Перемещение создаст форточку в исходном дне, не подходит
                                continue;
                            }
                            foundSource = key;
                            break;
                        }
                    }
                    if (foundSource) break;
                }
            }

            // Пробуем переместить
            if (foundSource && gapDay && gapPeriod) {
                const gapKey = `${cls.id}__${cls.shift}__${gapDay}__${gapPeriod}`;
                trySwap(foundSource, gapKey);
            } else {
                break; // Не нашли что переместить
            }
        }
        // === КОНЕЦ фазы устранения форточек ===

        // Break consecutive heavy - агрессивная фаза
        for (let pass = 0; pass < 30; pass++) {
            const analysisTmp = analyzeClassSchedule({
                classId: cls.id,
                className: cls.name,
                shift: cls.shift,
                periods,
                slotMap,
                subjectsById
            });
            const consec = analysisTmp.violations.filter((x) => x.type === 'heavy_consecutive');
            if (consec.length === 0) break;

            for (const v of consec) {
                const badKey = `${cls.id}__${cls.shift}__${v.day}__${v.period}`;
                // Пробуем переместить на preferred позиции в preferred дни
                for (const d2 of preferredDays) {
                    for (const p2 of preferred) {
                        const goodKey = `${cls.id}__${cls.shift}__${d2}__${p2}`;
                        if (goodKey === badKey) continue;
                        if (hasHeavyInSlot(goodKey)) continue;
                        if (trySwap(badKey, goodKey)) break;
                    }
                }
                // Если не получилось, пробуем любые другие позиции
                for (const d2 of DAYS) {
                    for (const p2 of periods) {
                        const goodKey = `${cls.id}__${cls.shift}__${d2}__${p2}`;
                        if (goodKey === badKey) continue;
                        if (hasHeavyInSlot(goodKey)) continue;
                        if (trySwap(badKey, goodKey)) break;
                    }
                }
            }
        }

        // --- Phase 2: Fix peak day violations - агрессивная фаза ---
        for (let pass = 0; pass < 20; pass++) {
            const analysisTmp = analyzeClassSchedule({
                classId: cls.id,
                className: cls.name,
                shift: cls.shift,
                periods,
                slotMap,
                subjectsById
            });
            const peakViolation = analysisTmp.violations.find((x) => x.type === 'peak_day_not_on_recommended');
            if (!peakViolation) break;

            const peakDay = analysisTmp.peakDay;
            const nonRecommendedDays = [DayOfWeek.Monday, DayOfWeek.Thursday];

            if (nonRecommendedDays.includes(peakDay as DayOfWeek)) {
                // Найти самый нагруженный слот в peakDay
                let maxLoadPeriod = periods[0];
                let maxLoad = 0;
                for (const period of periods) {
                    const key = `${cls.id}__${cls.shift}__${peakDay}__${period}`;
                    const slot = slotMap.get(key) || [];
                    const load = slot.reduce(
                        (sum, it) => sum + subjectDifficulty(subjectsById.get(it.subjectId), undefined),
                        0
                    );
                    if (load > maxLoad) {
                        maxLoad = load;
                        maxLoadPeriod = period;
                    }
                }

                // Попробовать переместить в recommended day с меньшей нагрузкой
                for (const recDay of preferredDays) {
                    for (const period of preferred) {
                        const fromKey = `${cls.id}__${cls.shift}__${peakDay}__${maxLoadPeriod}`;
                        const toKey = `${cls.id}__${cls.shift}__${recDay}__${period}`;
                        if (fromKey === toKey) continue;
                        if (hasHeavyInSlot(toKey)) continue;
                        if (trySwap(fromKey, toKey)) break;
                    }
                }
            }
        }

        // --- Phase 3: Balance day loads - новая фаза для баланса ---
        for (let pass = 0; pass < 15; pass++) {
            const analysisTmp = analyzeClassSchedule({
                classId: cls.id,
                className: cls.name,
                shift: cls.shift,
                periods,
                slotMap,
                subjectsById
            });
            const loads = DAYS.map((d) => analysisTmp.dayLoad[d] ?? 0);
            const maxLoadDay = DAYS.reduce((a, b) => (loads[DAYS.indexOf(a)] > loads[DAYS.indexOf(b)] ? a : b));
            const minLoadDay = DAYS.reduce((a, b) => (loads[DAYS.indexOf(a)] < loads[DAYS.indexOf(b)] ? a : b));

            if (loads[DAYS.indexOf(maxLoadDay)] - loads[DAYS.indexOf(minLoadDay)] < 5) break;

            // Найти самый тяжёлый слот в самом нагруженном дне
            let maxSlot: SlotKey | null = null;
            let maxSlotLoad = 0;
            for (const period of periods) {
                const key = `${cls.id}__${cls.shift}__${maxLoadDay}__${period}`;
                const slot = slotMap.get(key) || [];
                const load = slot.reduce(
                    (sum, it) => sum + subjectDifficulty(subjectsById.get(it.subjectId), undefined),
                    0
                );
                if (load > maxSlotLoad) {
                    maxSlotLoad = load;
                    maxSlot = key;
                }
            }

            // Найти самый лёгкий слот в самом лёгком дне
            let minSlot: SlotKey | null = null;
            let minSlotLoad = 999;
            for (const period of periods) {
                const key = `${cls.id}__${cls.shift}__${minLoadDay}__${period}`;
                const slot = slotMap.get(key) || [];
                const load = slot.reduce(
                    (sum, it) => sum + subjectDifficulty(subjectsById.get(it.subjectId), undefined),
                    0
                );
                if (load < minSlotLoad) {
                    minSlotLoad = load;
                    minSlot = key;
                }
            }

            if (maxSlot && minSlot && maxSlotLoad > minSlotLoad + 3) {
                trySwap(maxSlot, minSlot);
            } else {
                break;
            }
        }

        // --- Phase 4: stochastic search (simulated annealing) ---
        const maxIters = Math.max(10000, maxIterations);
        let temp = 200;
        const coolingRate = 0.9995;
        let swapsThisClass = 0;

        for (let iter = 0; iter < maxIters && swapsThisClass < maxSwaps; iter++) {
            // Умный выбор ячеек: предпочитаем ячейки с тяжёлыми предметами
            let keyA: SlotKey;
            let keyB: SlotKey;

            // С вероятностью 30% выбираем ячейку с тяжёлым предметом
            if (Math.random() < 0.3) {
                const heavyKeys = allKeys.filter((k) => hasHeavyInSlot(k));
                if (heavyKeys.length > 0) {
                    keyA = heavyKeys[Math.floor(Math.random() * heavyKeys.length)];
                } else {
                    keyA = allKeys[Math.floor(Math.random() * allKeys.length)];
                }
            } else {
                keyA = allKeys[Math.floor(Math.random() * allKeys.length)];
            }

            const idxB = Math.floor(Math.random() * allKeys.length);
            keyB = allKeys[idxB];

            if (keyA === keyB) continue;

            const a = slotMap.get(keyA) || [];
            const b = slotMap.get(keyB) || [];
            if (a.length === 0 && b.length === 0) continue;

            const parsedA = parseKey(keyA);
            const parsedB = parseKey(keyB);
            if (
                !canMoveSlotWithoutTeacherConflicts({
                    occupancy: teacherOccOtherClasses,
                    fromLessons: a,
                    toLessons: b,
                    from: { shift: parsedA.shift, day: parsedA.day, period: parsedA.period },
                    to: { shift: parsedB.shift, day: parsedB.day, period: parsedB.period }
                })
            ) {
                continue;
            }

            swapSlots(slotMap, keyA, keyB);
            const newPenalty = classPenalty({
                classId: cls.id,
                className: cls.name,
                shift: cls.shift,
                periods,
                slotMap,
                subjectsById
            });

            const delta = newPenalty - currentPenalty;
            const accept = delta <= 0 || Math.random() < Math.exp(-delta / Math.max(0.001, temp));

            if (accept) {
                currentPenalty = newPenalty;
                totalSwapsApplied++;
                swapsThisClass++;
            } else {
                swapSlots(slotMap, keyA, keyB);
            }

            temp *= coolingRate;

            // Ранняя остановка при отличном результате
            if (currentPenalty < 10) break;
        }

        const finalAnalysis = analyzeClassSchedule({
            classId: cls.id,
            className: cls.name,
            shift: cls.shift,
            periods,
            slotMap,
            subjectsById
        });
        analysisByClassId[cls.id] = finalAnalysis;

        byClassId.set(cls.id, flattenSlotMap(slotMap));
    }

    const schedule = Array.from(byClassId.values()).flat();
    return { schedule, analysisByClassId, swapsApplied: totalSwapsApplied };
}

export function applySlotSwaps(params: {
    schedule: ScheduleItem[];
    swaps: Array<{
        classId: string;
        shift: string;
        from: { day: string; period: number };
        to: { day: string; period: number };
    }>;
}): ScheduleItem[] {
    const { schedule, swaps } = params;
    const items = schedule.map((x) => ({ ...x }));
    const map = buildSlotMap(items);

    for (const s of swaps) {
        const keyA = `${s.classId}__${s.shift}__${s.from.day}__${s.from.period}`;
        const keyB = `${s.classId}__${s.shift}__${s.to.day}__${s.to.period}`;
        swapSlots(map, keyA, keyB);
    }
    return flattenSlotMap(map);
}
