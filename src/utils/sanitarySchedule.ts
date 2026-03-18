import { DAYS, DayOfWeek, ScheduleItem, Shift, Subject } from '../types';

type SlotKey = string;

export type SanitaryRuleViolation =
  | { type: 'heavy_first_or_last_more_than_once'; classId: string; position: 'first' | 'last'; count: number }
  | { type: 'heavy_consecutive'; classId: string; day: string; period: number }
  | { type: 'peak_day_not_on_recommended'; classId: string; peakDay: string; recommendedDays: string[] }
  | { type: 'unknown_subject_difficulty'; classId: string; subjectName: string };

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

const DEFAULT_UNKNOWN_DIFFICULTY = 6; // ближе к “середине”, чтобы не занижать нагрузку

// Важно: используем "вхождения", как в твоём примере, а не строгие совпадения.
const DIFFICULTY_BY_SUBJECT_NAME: Array<[RegExp, number]> = [
  [/математ|алгебр|геометр/i, 12],
  [/иностранн|английск|немецк|французск|испанск/i, 11],
  [/(русск(ий|ого)?\s+язык|рус\.?\s*яз)|((белорусск(ий|ого)?\s+язык|бел\.?\s*яз))|национального\s+меньшинства/i, 10],
  [/физик/i, 9],
  [/хими/i, 9],
  [/информатик/i, 8],
  [/астроном/i, 8],
  [/биолог/i, 8],
  [/всемирн.*истор|история\s+беларуси|обществовед/i, 7],
  [/литератур|русск\w*\s+лит|белорусск\w*\s+лит/i, 6],
  [/географ/i, 6],
  [/человек\s+и\s+мир/i, 5],
  [/искусств|мхк/i, 4],
  [/основы\s+безопасности|обж/i, 4],
  [/черчен|труд|технолог|трудовое\s+обучение/i, 4],
  [/физкультур|физическая\s+культура|допризывн|медицинск|здоровье/i, 3],
];

const HEAVY_SUBJECT_NAME_PATTERNS: RegExp[] = [
  /математ|алгебр|геометр/i,
  /(русск(ий|ого)?\s+язык|рус\.?\s*яз)/i,
  /(белорусск(ий|ого)?\s+язык|бел\.?\s*яз)/i,
  /национального\s+меньшинства/i,
  /иностранн|английск|немецк|французск|испанск/i,
  /физик/i,
  /хими/i,
];

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.]/g, '')
    .toLowerCase();
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

function isHeavySubject(subject: Subject | undefined, subjectNameFallback: string | undefined, grade: number | null): boolean {
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
  map.set(keyA, b.map((x) => ({ ...x, day: parseKey(keyA).day, period: parseKey(keyA).period })));
  map.set(keyB, a.map((x) => ({ ...x, day: parseKey(keyB).day, period: parseKey(keyB).period })));
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

  const dayLoad: Record<string, number> = Object.fromEntries(DAYS.map((d) => [d, 0]));
  const violations: SanitaryRuleViolation[] = [];

  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];

  let heavyFirstCount = 0;
  let heavyLastCount = 0;

  for (const day of DAYS) {
    for (const period of periods) {
      const key = `${classId}__${shift}__${day}__${period}`;
      const slot = slotMap.get(key) || [];
      for (const it of slot) {
        const subj = subjectsById.get(it.subjectId);
        const diff = subjectDifficulty(subj, undefined);
        dayLoad[day] += diff;

        const heavy = isHeavySubject(subj, undefined, grade);
        if (heavy && period === firstPeriod) heavyFirstCount++;
        if (heavy && period === lastPeriod) heavyLastCount++;
      }
    }
  }

  // Consecutive heavy check (any heavy in adjacent slots)
  for (const day of DAYS) {
    for (let i = 0; i < periods.length - 1; i++) {
      const pA = periods[i];
      const pB = periods[i + 1];
      const keyA = `${classId}__${shift}__${day}__${pA}`;
      const keyB = `${classId}__${shift}__${day}__${pB}`;
      const slotA = slotMap.get(keyA) || [];
      const slotB = slotMap.get(keyB) || [];
      const hasHeavyA = slotA.some((it) => isHeavySubject(subjectsById.get(it.subjectId), undefined, grade));
      const hasHeavyB = slotB.some((it) => isHeavySubject(subjectsById.get(it.subjectId), undefined, grade));
      if (hasHeavyA && hasHeavyB) {
        violations.push({ type: 'heavy_consecutive', classId, day, period: pB });
      }
    }
  }

  // Peak day
  let peakDay = DAYS[0];
  for (const d of DAYS) {
    if ((dayLoad[d] ?? 0) > (dayLoad[peakDay] ?? 0)) peakDay = d;
  }
  if (!recommendedPeakDays.includes(peakDay as DayOfWeek) && isVtoXI(grade)) {
    violations.push({
      type: 'peak_day_not_on_recommended',
      classId,
      peakDay,
      recommendedDays: recommendedPeakDays,
    });
  }

  // “Пн/Чт не должны быть тяжелее Вт/Ср/Пт” (сильнее соответствует требованию)
  if (isVtoXI(grade)) {
    const highLoadDays = [dayLoad[DayOfWeek.Tuesday] ?? 0, dayLoad[DayOfWeek.Wednesday] ?? 0, dayLoad[DayOfWeek.Friday] ?? 0];
    const lowLoadDays = [dayLoad[DayOfWeek.Monday] ?? 0, dayLoad[DayOfWeek.Thursday] ?? 0];
    const minHigh = Math.min(...highLoadDays);
    const maxLow = Math.max(...lowLoadDays);
    if (maxLow > minHigh) {
      violations.push({
        type: 'peak_day_not_on_recommended',
        classId,
        peakDay,
        recommendedDays: recommendedPeakDays,
      });
    }
  }

  // Heavy on first/last more than once
  if (heavyFirstCount > 1 && isVtoXI(grade)) {
    violations.push({ type: 'heavy_first_or_last_more_than_once', classId, position: 'first', count: heavyFirstCount });
  }
  if (heavyLastCount > 1 && isVtoXI(grade)) {
    violations.push({ type: 'heavy_first_or_last_more_than_once', classId, position: 'last', count: heavyLastCount });
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
  const v = analyzeClassSchedule(params).violations;

  // Base penalties from violations
  let penalty = 0;
  for (const viol of v) {
    if (viol.type === 'heavy_first_or_last_more_than_once') penalty += 2000 * (viol.count - 1);
    if (viol.type === 'heavy_consecutive') penalty += 250;
    if (viol.type === 'peak_day_not_on_recommended') penalty += 400;
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
        if (period === first || period === last) penalty += 80;
        if (period < 2 || period > 4) penalty += 25;
        if (period >= 2 && period <= 4) penalty -= 5; // tiny bonus
      }
    }
  }

  // Balance day loads (variance)
  const analysis = analyzeClassSchedule(params);
  const loads = DAYS.map((d) => analysis.dayLoad[d] ?? 0);
  const mean = loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length);
  const variance = loads.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / Math.max(1, loads.length);
  penalty += variance * 0.8;

  // Stronger: ensure Tue/Wed/Fri are not lighter than Mon/Thu (V–XI)
  if (isVtoXI(grade)) {
    const high = [analysis.dayLoad[DayOfWeek.Tuesday] ?? 0, analysis.dayLoad[DayOfWeek.Wednesday] ?? 0, analysis.dayLoad[DayOfWeek.Friday] ?? 0];
    const low = [analysis.dayLoad[DayOfWeek.Monday] ?? 0, analysis.dayLoad[DayOfWeek.Thursday] ?? 0];
    const minHigh = Math.min(...high);
    const maxLow = Math.max(...low);
    if (maxLow > minHigh) {
      penalty += (maxLow - minHigh) * 40 + 500;
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
      subjectsById,
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
}): SanitaryResult {
  const {
    baseSchedule,
    subjects,
    classes,
    periodsByShift,
    maxIterations = 25000,
    maxSwaps = 260,
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
    const { occupancy, fromLessons, toLessons, from, to } = params;
    // After swap: fromLessons go to "to" and toLessons go to "from"
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
  let swapsApplied = 0;

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
        heavyLastCount: 0,
      };
      continue;
    }

    const slotMap = buildSlotMap(clsItems);
    const teacherOccOtherClasses = buildTeacherOccupancy(resultItems, cls.id);

    let currentPenalty = classPenalty({
      classId: cls.id,
      className: cls.name,
      shift: cls.shift,
      periods,
      slotMap,
      subjectsById,
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
          to: { shift: parsedB.shift, day: parsedB.day, period: parsedB.period },
        })
      ) {
        return false;
      }
      const before = currentPenalty;
      swapSlots(slotMap, keyA, keyB);
      const after = classPenalty({ classId: cls.id, className: cls.name, shift: cls.shift, periods, slotMap, subjectsById });
      if (after <= before) {
        currentPenalty = after;
        swapsApplied++;
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

    // Reduce heavy on first/last (keep <= 1 per week)
    for (let pass = 0; pass < 8; pass++) {
      const analysisTmp = analyzeClassSchedule({ classId: cls.id, className: cls.name, shift: cls.shift, periods, slotMap, subjectsById });
      if (analysisTmp.heavyFirstCount <= 1 && analysisTmp.heavyLastCount <= 1) break;

      for (const day of DAYS) {
        const firstKey = `${cls.id}__${cls.shift}__${day}__${firstP}`;
        const lastKey = `${cls.id}__${cls.shift}__${day}__${lastP}`;

        const maybeFix = (badKey: SlotKey) => {
          if (!hasHeavyInSlot(badKey)) return;
          for (const d2 of DAYS) {
            for (const p2 of preferred) {
              const goodKey = `${cls.id}__${cls.shift}__${d2}__${p2}`;
              if (hasHeavyInSlot(goodKey)) continue; // swap heavy with non-heavy if possible
              if (trySwap(badKey, goodKey)) return;
            }
          }
        };

        if (analysisTmp.heavyFirstCount > 1) maybeFix(firstKey);
        if (analysisTmp.heavyLastCount > 1) maybeFix(lastKey);
      }
    }

    // Break consecutive heavy
    for (let pass = 0; pass < 10; pass++) {
      const analysisTmp = analyzeClassSchedule({ classId: cls.id, className: cls.name, shift: cls.shift, periods, slotMap, subjectsById });
      const consec = analysisTmp.violations.filter((x) => x.type === 'heavy_consecutive') as Array<{ type: 'heavy_consecutive'; classId: string; day: string; period: number }>;
      if (consec.length === 0) break;
      for (const v of consec.slice(0, 6)) {
        // v.period is the second of the consecutive pair, try swap it with a nearby non-heavy
        const badKey = `${cls.id}__${cls.shift}__${v.day}__${v.period}`;
        for (const p2 of preferred) {
          const goodKey = `${cls.id}__${cls.shift}__${v.day}__${p2}`;
          if (goodKey === badKey) continue;
          if (hasHeavyInSlot(goodKey)) continue;
          if (trySwap(badKey, goodKey)) break;
        }
      }
    }

    // --- Phase 2: stochastic search (annealing-lite) ---
    // Stochastic hill-climb with limited swaps
    const maxIters = Math.max(1000, maxIterations);
    const tempStart = 80;
    const tempEnd = 1.5;
    let swapsThisClass = 0;

    for (let iter = 0; iter < maxIters && swapsThisClass < maxSwaps; iter++) {
      const idxA = Math.floor(Math.random() * allKeys.length);
      let idxB = Math.floor(Math.random() * allKeys.length);
      if (idxB === idxA) idxB = (idxB + 1) % allKeys.length;
      const keyA = allKeys[idxA];
      const keyB = allKeys[idxB];

      if (keyA === keyB) continue;
      // skip no-op swaps (both empty)
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
          to: { shift: parsedB.shift, day: parsedB.day, period: parsedB.period },
        })
      ) {
        continue;
      }

      // do swap
      swapSlots(slotMap, keyA, keyB);
      const newPenalty = classPenalty({
        classId: cls.id,
        className: cls.name,
        shift: cls.shift,
        periods,
        slotMap,
        subjectsById,
      });

      const t = tempStart + (tempEnd - tempStart) * (iter / maxIters);
      const delta = newPenalty - currentPenalty;
      const accept = delta <= 0 || Math.random() < Math.exp(-delta / Math.max(0.001, t));
      if (accept) {
        currentPenalty = newPenalty;
        swapsApplied++;
        swapsThisClass++;
      } else {
        // revert
        swapSlots(slotMap, keyA, keyB);
      }

      // early stop: good enough
      if (currentPenalty < 150) break;
    }

    const finalAnalysis = analyzeClassSchedule({
      classId: cls.id,
      className: cls.name,
      shift: cls.shift,
      periods,
      slotMap,
      subjectsById,
    });
    analysisByClassId[cls.id] = finalAnalysis;

    byClassId.set(cls.id, flattenSlotMap(slotMap));
  }

  const schedule = Array.from(byClassId.values()).flat();
  return { schedule, analysisByClassId, swapsApplied };
}

export function applySlotSwaps(params: {
  schedule: ScheduleItem[];
  swaps: Array<{ classId: string; shift: string; from: { day: string; period: number }; to: { day: string; period: number } }>;
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

