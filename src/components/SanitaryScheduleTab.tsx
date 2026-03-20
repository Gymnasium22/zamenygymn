import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { ClassEntity, DAYS, DayOfWeek, ScheduleItem, SHIFT_PERIODS, Shift, Subject, Room, Teacher } from '../types';
import { Icon } from './Icons';
import { analyzeSanitarySchedule, applySlotSwaps, generateSanitarySchedule } from '../utils/sanitarySchedule';
import { Modal } from './UI';
import { BarChart } from './UI';

type Slot = { day: string; period: number };

function slotId(slot: Slot) {
  return `${slot.day}__${slot.period}`;
}

function gradeFromClassName(name: string): number | null {
  const m = name.trim().match(/^(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function buildClassGrid(params: {
  schedule: ScheduleItem[];
  classId: string;
  shift: string;
}): Map<string, ScheduleItem[]> {
  const { schedule, classId, shift } = params;
  const map = new Map<string, ScheduleItem[]>();
  for (const it of schedule) {
    if (it.classId !== classId) continue;
    if (it.shift !== shift) continue;
    const key = slotId({ day: it.day, period: it.period });
    const arr = map.get(key) || [];
    arr.push(it);
    map.set(key, arr);
  }
  return map;
}

function classSortKey(name: string): { grade: number; letter: string; raw: string } {
  const m = name.trim().match(/^(\d{1,2})\s*([А-ЯA-Z])?/);
  const grade = m ? parseInt(m[1], 10) || 0 : 0;
  const letter = (m && m[2]) || '';
  return { grade, letter, raw: name };
}

export function SanitaryScheduleTab(props: {
  semester: 1 | 2;
  onSemesterChange: (s: 1 | 2) => void;
  schedule1: ScheduleItem[];
  schedule2: ScheduleItem[];
  classes: ClassEntity[];
  subjects: Subject[];
  rooms: Room[];
  teachers: Teacher[];
}) {
  const { semester, onSemesterChange, schedule1, schedule2, classes, subjects, rooms, teachers } = props;

  const baseSchedule = useMemo(() => (semester === 2 ? schedule2 : schedule1), [semester, schedule1, schedule2]);

  const eligibleClasses = useMemo(
    () =>
      classes
        .filter((c) => !c.excludeFromReports)
        .slice()
        .sort((a, b) => {
          const ka = classSortKey(a.name);
          const kb = classSortKey(b.name);
          if (ka.grade !== kb.grade) return ka.grade - kb.grade;
          if (ka.letter !== kb.letter) return ka.letter.localeCompare(kb.letter, 'ru');
          return ka.raw.localeCompare(kb.raw, 'ru');
        }),
    [classes],
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [filterShift, setFilterShift] = useState<Shift | 'all'>('all');

  const filteredEligibleClasses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return eligibleClasses.filter((c) => {
      const matchesQ = !q || c.name.toLowerCase().includes(q);
      const matchesShift = filterShift === 'all' || c.shift === filterShift;
      return matchesQ && matchesShift;
    });
  }, [eligibleClasses, searchTerm, filterShift]);

  const [selectedClassId, setSelectedClassId] = useState<string>(() => eligibleClasses[0]?.id || '');
  const selectedClass = useMemo(() => eligibleClasses.find((c) => c.id === selectedClassId), [eligibleClasses, selectedClassId]);

  type ViewMode = 'overview' | 'class';
  const [viewMode, setViewMode] = useState<ViewMode>('overview');

  const [manualSwaps, setManualSwaps] = useState<
    Array<{ classId: string; shift: string; from: Slot; to: Slot }>
  >([]);
  const [activePick, setActivePick] = useState<Slot | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [lastOptimizedAt, setLastOptimizedAt] = useState<string>('');
  const [modeLabel, setModeLabel] = useState<'auto' | 'base'>('auto');
  const allowTeacherConflicts = true; // Учителя не учитываются для санстанции

  const periods = useMemo(() => {
    if (!selectedClass) return [];
    return SHIFT_PERIODS[selectedClass.shift as Shift] || [];
  }, [selectedClass]);

  const [sanitaryBase, setSanitaryBase] = useState(() => {
    const analysisByClassId = analyzeSanitarySchedule({
      schedule: baseSchedule.map((x) => ({ ...x })),
      subjects,
      classes: eligibleClasses.map((c) => ({ id: c.id, name: c.name, shift: c.shift })),
      periodsByShift: SHIFT_PERIODS as any,
    });
    return { schedule: baseSchedule.map((x) => ({ ...x })), analysisByClassId, swapsApplied: 0 };
  });

  useEffect(() => {
    // При смене полугодия быстро пересчитываем только анализ, без тяжёлой оптимизации
    const analysisByClassId = analyzeSanitarySchedule({
      schedule: baseSchedule.map((x) => ({ ...x })),
      subjects,
      classes: eligibleClasses.map((c) => ({ id: c.id, name: c.name, shift: c.shift })),
      periodsByShift: SHIFT_PERIODS as any,
    });
    setSanitaryBase({ schedule: baseSchedule.map((x) => ({ ...x })), analysisByClassId, swapsApplied: 0 });
    setModeLabel('base');
    setLastOptimizedAt(new Date().toLocaleString('ru-RU'));
    setSwapError(null);
    setActivePick(null);
    setManualSwaps([]);
    setViewMode('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semester]);

  const allClassesStats = useMemo(() => {
    const rows = eligibleClasses.map((c) => {
      const a = sanitaryBase.analysisByClassId[c.id];
      const violations = a?.violations?.length ?? 0;
      const heavyFirst = a?.heavyFirstCount ?? 0;
      const heavyLast = a?.heavyLastCount ?? 0;
      const peakDay = a?.peakDay;
      const dayLoad = a?.dayLoad;
      // Подсчёт типов нарушений
      const violationTypes = {
        heavyFirstOrLast: a?.violations.filter(v => v.type === 'heavy_first_or_last_more_than_once').length ?? 0,
        consecutive: a?.violations.filter(v => v.type === 'heavy_consecutive').length ?? 0,
        peakDay: a?.violations.filter(v => v.type === 'peak_day_not_on_recommended').length ?? 0,
      };
      return { 
        id: c.id, 
        name: c.name, 
        shift: c.shift, 
        violations, 
        heavyFirst, 
        heavyLast,
        peakDay, 
        dayLoad,
        violationTypes 
      };
    });
    const ok = rows.filter((r) => r.violations === 0).length;
    const totalViolations = rows.reduce((sum, r) => sum + r.violations, 0);
    return { rows, ok, total: rows.length, totalViolations };
  }, [eligibleClasses, sanitaryBase.analysisByClassId]);

  const sanitarySchedule = useMemo(() => {
    if (!selectedClass) return sanitaryBase.schedule;
    const relevantSwaps = manualSwaps.filter((s) => s.classId === selectedClass.id && s.shift === selectedClass.shift);
    return applySlotSwaps({ schedule: sanitaryBase.schedule, swaps: relevantSwaps });
  }, [sanitaryBase.schedule, manualSwaps, selectedClass]);

  const analysis = useMemo(() => {
    if (!selectedClass) return null;
    return sanitaryBase.analysisByClassId[selectedClass.id] || null;
  }, [sanitaryBase.analysisByClassId, selectedClass]);

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const baseGrid = useMemo(() => {
    if (!selectedClass) return new Map<string, ScheduleItem[]>();
    return buildClassGrid({ schedule: baseSchedule, classId: selectedClass.id, shift: selectedClass.shift });
  }, [baseSchedule, selectedClass]);

  const sanitaryGrid = useMemo(() => {
    if (!selectedClass) return new Map<string, ScheduleItem[]>();
    return buildClassGrid({ schedule: sanitarySchedule, classId: selectedClass.id, shift: selectedClass.shift });
  }, [sanitarySchedule, selectedClass]);

  const posterRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const downloadPosterPng = async () => {
    if (!posterRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(posterRef.current, { scale: 2, backgroundColor: '#ffffff', logging: false });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `Плакат_Санстанция_${selectedClass?.name || ''}_${semester}пол.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadPosterXls = () => {
    if (!selectedClass) return;
    const safeName = selectedClass.name.replace(/[\\/:*?"<>|]/g, '_');

    const renderCell = (items: ScheduleItem[]) => {
      if (items.length === 0) return '';
      return items
        .map((it) => {
          const subj = subjectsById.get(it.subjectId);
          const room = it.roomId ? roomsById.get(it.roomId) : undefined;
          const roomName = room ? room.name : (it.roomId || '');
          const dir = it.direction ? ` (${it.direction})` : '';
          const roomPart = roomName ? ` <span style="font-size:10px; font-weight:bold;">каб. ${roomName}</span>` : '';
          return `<div style="margin-bottom:4px;"><div style="font-weight:bold;">${subj?.name || ''}${dir}</div>${roomPart}</div>`;
        })
        .join('');
    };

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"><style>
        table { border-collapse: collapse; font-family: Arial, sans-serif; width: 100%; }
        td, th { border: 2px solid #000; padding: 6px; vertical-align: top; text-align: center; }
        .hdr { background-color: #f3f4f6; font-weight: 800; text-transform: uppercase; }
        .p { width: 50px; background-color: #f8fafc; font-weight: 900; }
        .cell { height: 60px; }
        .title { font-size: 18px; font-weight: 900; }
        .sub { font-size: 11px; color: #334155; }
      </style></head><body>
    `;

    html += `<div class="title">Плакат для санстанции — ${safeName}</div>`;
    html += `<div class="sub">${selectedClass.shift} • ${semester}-е полугодие</div><br/>`;

    html += `<table>`;
    html += `<tr><th class="hdr">Урок</th>`;
    DAYS.forEach((d) => (html += `<th class="hdr">${d}</th>`));
    html += `</tr>`;

    periods.forEach((p) => {
      html += `<tr><td class="p">${p}</td>`;
      DAYS.forEach((day) => {
        const items = sanitaryGrid.get(slotId({ day, period: p })) || [];
        html += `<td class="cell">${renderCell(items)}</td>`;
      });
      html += `</tr>`;
    });

    html += `</table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Плакат_Санстанция_${safeName}_${semester}пол.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadAllClassesXls = () => {
    const currentSchedule = applySlotSwaps({ schedule: sanitaryBase.schedule, swaps: manualSwaps });

    // Сортировка классов от младших к старшим с учётом буквы
    const targetClasses = eligibleClasses.slice().sort((a, b) => {
      const ka = classSortKey(a.name);
      const kb = classSortKey(b.name);
      if (ka.grade !== kb.grade) return ka.grade - kb.grade;
      if (ka.letter !== kb.letter) return ka.letter.localeCompare(kb.letter, 'ru');
      return ka.raw.localeCompare(kb.raw, 'ru');
    });
    const shifts = (Array.from(new Set(targetClasses.map((c) => c.shift))) as string[]).sort();

    const dayStyles: Record<string, { label: string; cell: string }> = {
      [DayOfWeek.Monday]: { label: '#fecaca', cell: '#fee2e2' },
      [DayOfWeek.Tuesday]: { label: '#fed7aa', cell: '#ffedd5' },
      [DayOfWeek.Wednesday]: { label: '#fef08a', cell: '#fef9c3' },
      [DayOfWeek.Thursday]: { label: '#bbf7d0', cell: '#dcfce7' },
      [DayOfWeek.Friday]: { label: '#bfdbfe', cell: '#dbeafe' },
    };

    // Функция для получения балла трудности предмета
    const getSubjectDifficulty = (subjectId: string): number => {
      const subj = subjects.find((s) => s.id === subjectId);
      if (!subj) return 6;
      if (typeof subj.difficulty === 'number' && subj.difficulty > 0) return subj.difficulty;
      // Fallback к анализу по названию (как в sanitarySchedule.ts)
      const name = subj.name.toLowerCase();
      if (/математ|алгебр|геометр/i.test(name)) return 12;
      if (/иностранн|английск|немецк|французск|испанск/i.test(name)) return 11;
      if (/русск.*язык|рус[.]?яз|белорусск.*язык|бел[.]?яз/i.test(name)) return 10;
      if (/физик/i.test(name)) return 9;
      if (/хими/i.test(name)) return 9;
      if (/информатик/i.test(name)) return 8;
      if (/астроном/i.test(name)) return 8;
      if (/биолог/i.test(name)) return 8;
      if (/всемирн.*истор|история\s+беларуси|обществовед/i.test(name)) return 7;
      if (/литератур/i.test(name)) return 6;
      if (/географ/i.test(name)) return 6;
      if (/человек\s+и\s+мир/i.test(name)) return 5;
      if (/искусств|мхк/i.test(name)) return 4;
      if (/основы\s+безопасности|обж/i.test(name)) return 4;
      if (/черчен|труд|технолог/i.test(name)) return 4;
      if (/физкультур|физическая\s+культура/i.test(name)) return 3;
      return 6;
    };

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; width: 100%; }
          td, th { border: 1px solid #000000; text-align: center; vertical-align: middle; padding: 4px; }
          .shift-header { font-size: 16pt; font-weight: bold; background-color: #ffffff; text-align: center; border: 2px solid #000; }
          .class-header { font-size: 12pt; font-weight: bold; background-color: #ffffff; text-align: center; border: 2px solid #000; }
          .day-cell {
            font-weight: bold;
            text-transform: uppercase;
            writing-mode: vertical-lr;
            transform: rotate(180deg);
            text-align: center;
            vertical-align: middle;
            border: 2px solid #000;
            mso-rotate: 90;
          }
          .period-cell { font-weight: bold; border: 2px solid #000; }
          .content-cell { font-weight: bold; border: 1px solid #000; height: 50px; }
          .subject { font-weight: bold; }
          .room { font-size: 8pt; font-weight: bold; }
          .difficulty { font-size: 7pt; font-weight: bold; color: #666; }
          .day-total { font-size: 9pt; font-weight: bold; background-color: #fef3c7; }
        </style>
      </head>
      <body>
    `;

    shifts.forEach((shift) => {
      const shiftClasses = targetClasses.filter((c) => c.shift === shift);
      const periods = SHIFT_PERIODS[shift as Shift];
      if (shiftClasses.length === 0) return;

      html += `<table>`;

      html += `<tr>`;
      html += `<td style="border:none"></td>`;
      html += `<td style="border:none"></td>`;
      html += `<td style="border:none"></td>`;
      html += `<td colspan="${shiftClasses.length}" class="shift-header">${shift}</td>`;
      html += `</tr>`;

      html += `<tr>`;
      html += `<td style="border:none"></td>`;
      html += `<td style="border:none"></td>`;
      html += `<td style="border:none"></td>`;
      shiftClasses.forEach((c) => {
        html += `<td class="class-header">${c.name}</td>`;
      });
      html += `</tr>`;

      DAYS.forEach((day) => {
        const colors = dayStyles[day as string] || { label: '#e5e7eb', cell: '#f3f4f6' };

        periods.forEach((period, pIndex) => {
          html += `<tr>`;
          if (pIndex === 0) {
            html += `<td rowspan="${periods.length}" class="day-cell" style="background-color: ${colors.label};">${day.toUpperCase()}</td>`;
          }
          html += `<td class="period-cell" style="background-color: ${colors.label};">${period}</td>`;
          html += `<td class="period-cell" style="background-color: ${colors.label}; font-size: 8pt;">Балл</td>`;

          shiftClasses.forEach((cls) => {
            const lessons = currentSchedule.filter(
              (s) => s.classId === cls.id && s.day === day && s.shift === shift && s.period === period,
            );

            html += `<td class="content-cell" style="background-color: ${colors.cell};">`;
            lessons.forEach((lesson, i) => {
              if (i > 0) html += `<br style="mso-data-placement:same-cell;">`;
              const sub = subjects.find((s) => s.id === lesson.subjectId);
              const room = rooms.find((r) => r.id === lesson.roomId);
              const roomName = room ? room.name : (lesson.roomId || '');
              const difficulty = getSubjectDifficulty(lesson.subjectId);

              html += `<span class="subject">${sub?.name || ''}</span>`;
              if (roomName) html += ` <span class="room">${roomName}</span>`;
              html += ` <span class="difficulty">(${difficulty})</span>`;
            });
            html += `</td>`;
          });

          html += `</tr>`;
        });

        // Row for day totals per class
        html += `<tr>`;
        html += `<td colspan="2" class="day-total" style="background-color: ${colors.label}; text-align: right; padding-right: 8px;">Сумма баллов за день:</td>`;
        html += `<td class="day-total" style="background-color: ${colors.label};"></td>`;

        shiftClasses.forEach((cls) => {
          const dayLessons = currentSchedule.filter(
            (s) => s.classId === cls.id && s.day === day && s.shift === shift,
          );
          const totalDifficulty = dayLessons.reduce((sum, lesson) => sum + getSubjectDifficulty(lesson.subjectId), 0);
          html += `<td class="day-total" style="background-color: ${colors.cell}; font-weight: bold;">${totalDifficulty}</td>`;
        });

        html += `</tr>`;

        html += `<tr><td colspan="${3 + shiftClasses.length}" style="height: 3px; background-color: #000000; border: none;"></td></tr>`;
      });

      html += `</table><br><br>`;
    });

    html += `</body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Сетка_Расписания_ВСЕ_${semester}пол.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetManual = () => {
    setManualSwaps([]);
    setActivePick(null);
    setSwapError(null);
  };

  const triggerAuto = async () => {
    setIsOptimizing(true);
    resetManual();
    await new Promise((r) => setTimeout(r, 0));
    const next = generateSanitarySchedule({
      baseSchedule,
      subjects,
      classes: eligibleClasses.map((c) => ({ id: c.id, name: c.name, shift: c.shift })),
      periodsByShift: SHIFT_PERIODS as any,
      maxIterations: 100000, // Увеличено для лучшей оптимизации
      maxSwaps: 1500, // Увеличено для большей свободы перемещений
      enforceTeacherConflicts: false, // Учителя не учитываются
    });
    setSanitaryBase(next);
    setLastOptimizedAt(new Date().toLocaleString('ru-RU'));
    setModeLabel('auto');
    setIsOptimizing(false);
    setViewMode('overview');
  };

  const resetToBaseSchedule = async () => {
    setIsOptimizing(true);
    resetManual();
    await new Promise((r) => setTimeout(r, 0));
    const analysisByClassId = analyzeSanitarySchedule({
      schedule: baseSchedule.map((x) => ({ ...x })),
      subjects,
      classes: eligibleClasses.map((c) => ({ id: c.id, name: c.name, shift: c.shift })),
      periodsByShift: SHIFT_PERIODS as any,
    });
    setSanitaryBase({ schedule: baseSchedule.map((x) => ({ ...x })), analysisByClassId, swapsApplied: 0 });
    setLastOptimizedAt(new Date().toLocaleString('ru-RU'));
    setModeLabel('base');
    setIsOptimizing(false);
    setViewMode('overview');
  };

  const onCellClick = (slot: Slot) => {
    if (!selectedClass) return;
    setSwapError(null);
    if (!activePick) {
      setActivePick(slot);
      return;
    }
    const same = activePick.day === slot.day && activePick.period === slot.period;
    if (same) {
      setActivePick(null);
      return;
    }
    if (!allowTeacherConflicts) {
      // Teacher conflict validation (like in your sample)
      const scheduleNow = applySlotSwaps({
        schedule: sanitaryBase.schedule,
        swaps: manualSwaps.filter((s) => s.classId === selectedClass.id && s.shift === selectedClass.shift),
      });
      const slotLessons = (s: Slot) =>
        scheduleNow.filter(
          (it) =>
            it.classId === selectedClass.id && it.shift === selectedClass.shift && it.day === s.day && it.period === s.period,
        );
      const aLessons = slotLessons(activePick);
      const bLessons = slotLessons(slot);
      const aIds = new Set(aLessons.map((x) => x.id));
      const bIds = new Set(bLessons.map((x) => x.id));
      const ignore = new Set([...aIds, ...bIds]);

      const isTeacherFree = (teacherId: string, day: string, period: number) => {
        return !scheduleNow.some(
          (it) =>
            !ignore.has(it.id) &&
            it.teacherId === teacherId &&
            it.shift === selectedClass.shift &&
            it.day === day &&
            it.period === period,
        );
      };

      const okA = aLessons.every((it) => isTeacherFree(it.teacherId, slot.day, slot.period));
      const okB = bLessons.every((it) => isTeacherFree(it.teacherId, activePick.day, activePick.period));

      if (!okA || !okB) {
        setSwapError('Один из учителей занят в выбранное время. Обмен невозможен.');
        setActivePick(null);
        return;
      }
    }

    setManualSwaps((prev) => [...prev, { classId: selectedClass.id, shift: selectedClass.shift, from: activePick, to: slot }]);
    setActivePick(null);
  };

  const classGrade = selectedClass ? gradeFromClassName(selectedClass.name) : null;
  const isVtoXI = classGrade == null ? true : classGrade >= 5;
  const okViolations = analysis ? analysis.violations.length === 0 : true;

  const dayLoadChart = useMemo(() => {
    const rows = eligibleClasses.map((c) => sanitaryBase.analysisByClassId[c.id]).filter(Boolean);
    const totals = Object.fromEntries(DAYS.map((d) => [d, 0])) as Record<string, number>;
    const count = Math.max(1, rows.length);
    for (const a of rows) {
      for (const d of DAYS) totals[d] += a.dayLoad[d] ?? 0;
    }
    const items = DAYS.map((d) => ({
      id: d,
      label: d,
      value: Math.round((totals[d] / count) * 10) / 10,
    }));
    const max = Math.max(...items.map((x) => x.value), 1);
    return { items, max };
  }, [eligibleClasses, sanitaryBase.analysisByClassId]);

  const criticalClasses = useMemo(() => {
    return allClassesStats.rows.filter((r) => {
      if (r.violations === 0) return false;
      const a = sanitaryBase.analysisByClassId[r.id];
      if (!a) return false;
      const manyFirst = a.heavyFirstCount > 2;
      const manyLast = a.heavyLastCount > 2;
      const hasStrong = (a.violations || []).some(
        (v) =>
          v.type === 'heavy_consecutive' ||
          v.type === 'peak_day_not_on_recommended' ||
          v.type === 'heavy_first_or_last_more_than_once',
      );
      return manyFirst || manyLast || hasStrong;
    });
  }, [allClassesStats.rows, sanitaryBase.analysisByClassId]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Icon name="Shield" className="text-indigo-600 dark:text-indigo-400" /> Санстанция (недельный шаблон)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Автонастройка распределяет нагрузку по требованиям, не меняя действующее расписание. Можно вручную обменять ячейки и экспортировать плакат.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {isOptimizing ? (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-black">
                  <Icon name="Loader" size={14} className="animate-spin" /> Настройка…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold">
                  {lastOptimizedAt ? <>Обновлено: <span className="font-black">{lastOptimizedAt}</span></> : 'Готово'}
                </span>
              )}
              <button
                onClick={() => setViewMode('overview')}
                className={`px-3 py-1.5 rounded-xl font-black border transition ${
                  viewMode === 'overview'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                }`}
              >
                Обзор
              </button>
              <button
                onClick={() => setViewMode('class')}
                disabled={!selectedClass}
                className={`px-3 py-1.5 rounded-xl font-black border transition disabled:opacity-50 ${
                  viewMode === 'class'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                }`}
              >
                Редактор класса
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Icon name="Search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск класса..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all w-44 dark:text-white"
              />
            </div>
            <select
              value={filterShift}
              onChange={(e) => setFilterShift(e.target.value as Shift | 'all')}
              className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm outline-none"
            >
              <option value="all">Все смены</option>
              <option value={Shift.First}>1 смена</option>
              <option value={Shift.Second}>2 смена</option>
            </select>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Полугодие:</span>
              <select
                value={semester}
                onChange={(e) => onSemesterChange(Number(e.target.value) as 1 | 2)}
                className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value={1}>1-е</option>
                <option value={2}>2-е</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Класс:</span>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  resetManual();
                }}
                className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer max-w-[220px]"
              >
                {filteredEligibleClasses.map((c) => (
                  <option key={String(c.id)} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={triggerAuto} className="btn-primary btn-ripple flex items-center gap-2">
              {isOptimizing ? <Icon name="Loader" size={18} className="animate-spin" /> : <Icon name="Zap" size={18} />} Автонастройка
            </button>
            <button
              onClick={resetManual}
              className="px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition flex items-center gap-2"
            >
              <Icon name="RotateCcw" size={18} /> Сброс правок
            </button>
            <button
              onClick={resetToBaseSchedule}
              className="px-4 py-3 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-900 rounded-xl font-bold hover:bg-rose-100 dark:hover:bg-rose-900/30 transition flex items-center gap-2"
            >
              <Icon name="RotateCcw" size={18} /> Вернуть как в расписании
            </button>
            <button
              onClick={downloadPosterPng}
              disabled={isExporting || !selectedClass || viewMode !== 'class'}
              className="px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50"
            >
              {isExporting ? <><Icon name="Loader" size={18} className="animate-spin" /> Создание...</> : <><Icon name="Download" size={18} /> Скачать плакат</>}
            </button>
            <button
              onClick={downloadPosterXls}
              disabled={!selectedClass || viewMode !== 'class'}
              className="px-4 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-900 rounded-xl font-bold hover:bg-purple-100 dark:hover:bg-purple-900/50 transition flex items-center gap-2 disabled:opacity-50"
            >
              <Icon name="FileSpreadsheet" size={18} /> Скачать XLS
            </button>
            <button
              onClick={downloadAllClassesXls}
              className="px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition flex items-center gap-2"
            >
              <Icon name="FileSpreadsheet" size={18} /> XLS (все классы)
            </button>
            <button
              onClick={() => setShowAuditModal(true)}
              className="px-4 py-3 bg-slate-100 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-2"
            >
              <Icon name="AlertTriangle" size={18} /> Аудит
            </button>
          </div>
        </div>
        {swapError && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-xl text-sm font-bold text-red-700 dark:text-red-200 flex items-center gap-2">
            <Icon name="AlertTriangle" size={16} /> {swapError}
          </div>
        )}
      </div>

      <Modal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} title="Аудит СанПиН (все классы)" maxWidth="max-w-5xl">
        <div className="space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Показаны классы с замечаниями после автонастройки. Клик по строке — перейти к классу.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                День / средняя нагрузка / норма
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {dayLoadChart.items.map((item) => {
                    const isHighDay =
                      item.id === DayOfWeek.Tuesday ||
                      item.id === DayOfWeek.Wednesday ||
                      item.id === DayOfWeek.Friday;
                    const labelNorm = isHighDay ? 'Пик' : 'Легче';
                    return (
                      <tr key={String(item.id)} className="border-b border-slate-100 dark:border-slate-700 last:border-0">
                        <td className="py-1 pr-2 font-bold text-slate-700 dark:text-slate-200 w-10">
                          {item.label}
                        </td>
                        <td className="py-1 pr-2 text-slate-600 dark:text-slate-300">
                          {item.value.toFixed(1)} б.
                        </td>
                        <td className="py-1 text-right">
                          <span
                            className={
                              isHighDay
                                ? 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                                : 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-200'
                            }
                          >
                            {labelNorm}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-rose-200 dark:border-rose-900 p-4 bg-rose-50/50 dark:bg-rose-900/10">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-black text-rose-700 dark:text-rose-300 uppercase tracking-wider">
                  Классы с критическими нарушениями
                </div>
                <span className="text-xs font-black text-rose-700 dark:text-rose-300">
                  {criticalClasses.length}
                </span>
              </div>
              {criticalClasses.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  Критические нарушения не обнаружены.
                </div>
              ) : (
                <ul className="space-y-1 text-xs">
                  {criticalClasses.map((r) => (
                    <li
                      key={String(r.id)}
                      className="flex items-center justify-between gap-2 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 px-2 py-1 rounded-lg"
                      onClick={() => {
                        setSelectedClassId(r.id);
                        resetManual();
                        setViewMode('class');
                        setShowAuditModal(false);
                      }}
                    >
                      <span className="font-bold text-rose-700 dark:text-rose-200">{r.name}</span>
                      <span className="text-[10px] font-black text-rose-500 dark:text-rose-300">
                        нарушений: {r.violations}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left p-3 font-black text-xs uppercase tracking-wider text-slate-500">Класс</th>
                  <th className="text-left p-3 font-black text-xs uppercase tracking-wider text-slate-500">Смена</th>
                  <th className="text-left p-3 font-black text-xs uppercase tracking-wider text-slate-500">Замечания</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {allClassesStats.rows
                  .filter((r) => r.violations > 0)
                  .map((r) => {
                    const a = sanitaryBase.analysisByClassId[r.id];
                    return (
                      <tr
                        key={String(r.id)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() => {
                          setSelectedClassId(r.id);
                          resetManual();
                          setShowAuditModal(false);
                        }}
                      >
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{r.name}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{r.shift}</td>
                        <td className="p-3">
                          <ul className="space-y-1 text-xs font-bold text-red-700 dark:text-red-300">
                            {(a?.violations || []).slice(0, 6).map((v, idx) => (
                              <li key={idx}>
                                {v.type === 'heavy_first_or_last_more_than_once' && (
                                  <>Тяжёлые на {v.position === 'first' ? '1-м' : 'последнем'}: {v.count} раз (норма ≤ 1)</>
                                )}
                                {v.type === 'heavy_consecutive' && <>Тяжёлые подряд: {v.day} (около {v.period}-го)</>}
                                {v.type === 'peak_day_not_on_recommended' && <>Пик нагрузки на {v.peakDay} (рекомендуется Вт/Ср/Пт)</>}
                              </li>
                            ))}
                          </ul>
                          {(a?.violations?.length || 0) > 6 && (
                            <div className="mt-2 text-[10px] text-slate-400">…ещё {(a?.violations?.length || 0) - 6}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {allClassesStats.rows.filter((r) => r.violations > 0).length === 0 && (
            <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 font-bold">
              Отлично: замечаний не найдено.
            </div>
          )}
        </div>
      </Modal>

      {viewMode === 'overview' && (
        <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Автонастройка</div>
              <div className="text-lg font-bold text-slate-800 dark:text-white">Итог по всем классам</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Клик по строке — открыть редактор выбранного класса (и ручные обмены).
              </div>
              <div className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                Режим: <span className="font-black">{modeLabel === 'auto' ? 'Автонастройка' : 'Как в действующем расписании'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                OK: {allClassesStats.ok} / {allClassesStats.total}
              </div>
              {allClassesStats.totalViolations > 0 && (
                <div className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
                  Нарушений: {allClassesStats.totalViolations}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider">График</div>
                  <div className="text-lg font-bold text-slate-800 dark:text-white">Средняя нагрузка по дням</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Среднее по всем классам (баллы по шкале трудности).
                  </div>
                </div>
                <div className="text-xs font-black text-slate-500 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2">
                  Пик: Вт/Ср/Пт
                </div>
              </div>
              <BarChart items={dayLoadChart.items} max={dayLoadChart.max} barClassName="bg-indigo-600" />
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700">
              <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Подсказки</div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-2 space-y-2">
                <div>1) Жми <span className="font-black">Автонастройка</span> → смотри, где остались замечания.</div>
                <div>2) Открой класс → сделай 1–2 обмена вокруг тяжёлых предметов.</div>
                <div>3) Экспортируй <span className="font-black">XLS (все классы)</span>.</div>
              </div>
            </div>
          </div>

          <div className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left p-3 font-black text-xs uppercase tracking-wider text-slate-500">Класс</th>
                  <th className="text-left p-3 font-black text-xs uppercase tracking-wider text-slate-500">Смена</th>
                  <th className="text-right p-3 font-black text-xs uppercase tracking-wider text-slate-500">Замечания</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {allClassesStats.rows
                  .filter((r) => {
                    const q = searchTerm.trim().toLowerCase();
                    const matchesQ = !q || r.name.toLowerCase().includes(q);
                    const matchesShift = filterShift === 'all' || r.shift === filterShift;
                    return matchesQ && matchesShift;
                  })
                  .map((r) => (
                    <tr
                      key={String(r.id)}
                      className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${r.id === selectedClassId ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}`}
                      onClick={() => {
                        setSelectedClassId(r.id);
                        resetManual();
                        setViewMode('class');
                      }}
                    >
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{r.name}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{r.shift}</td>
                      <td className="p-3 text-right font-black">
                        <span className={r.violations === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                          {r.violations}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'class' && selectedClass && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Ручная правка</div>
                <div className="text-lg font-bold text-slate-800 dark:text-white">
                  Нажми ячейку → нажми вторую ячейку, чтобы обменять
                </div>
              </div>
              {activePick && (
                <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-900 rounded-xl px-3 py-2">
                  Выбрано: {activePick.day} • {activePick.period} урок
                </div>
              )}
            </div>

            <div ref={posterRef} className="bg-white text-slate-900 p-6 rounded-xl border border-slate-200">
              <div className="flex items-end justify-between gap-4 border-b-2 border-slate-800 pb-3 mb-4">
                <div>
                  <div className="text-xs font-black text-slate-500 uppercase tracking-wider">Плакат для санстанции</div>
                  <div className="text-2xl font-black tracking-tight">{selectedClass.name}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
                    {selectedClass.shift} • {semester}-е полугодие
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Версия</div>
                  <div className="text-sm font-bold">{manualSwaps.length ? `Правки: ${manualSwaps.length}` : `Авто`}</div>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full border-collapse border-2 border-black text-center text-sm">
                  <thead>
                    <tr>
                      <th className="border-2 border-black bg-slate-100 w-12">Урок</th>
                      {DAYS.map((d) => (
                        <th key={String(d)} className="border-2 border-black bg-slate-100 py-2 font-black uppercase tracking-wider">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr key={String(p)}>
                        <td className="border-2 border-black font-black bg-slate-50">{p}</td>
                        {DAYS.map((day) => {
                          const k = slotId({ day, period: p });
                          const items = sanitaryGrid.get(k) || [];
                          const isPicked = activePick && activePick.day === day && activePick.period === p;
                          const hasChanges = manualSwaps.some((s) =>
                            (s.from.day === day && s.from.period === p) || (s.to.day === day && s.to.period === p),
                          );
                          return (
                            <td
                              key={String(k)}
                              onClick={() => onCellClick({ day, period: p })}
                              className={[
                                'border-2 border-black p-2 align-top cursor-pointer select-none transition',
                                isPicked ? 'ring-4 ring-indigo-400 ring-inset bg-indigo-50' : 'hover:bg-slate-50',
                                hasChanges ? 'bg-amber-50' : '',
                              ].join(' ')}
                            >
                              {items.length === 0 ? (
                                <div className="text-slate-300 font-bold">—</div>
                              ) : (
                                <div className="space-y-1">
                                  {items.map((it) => {
                                    const subj = subjectsById.get(it.subjectId);
                                    const room = it.roomId ? roomsById.get(it.roomId) : undefined;
                                    const roomName = room ? room.name : (it.roomId || '');
                                    return (
                                      <div key={String(it.id)} className="leading-tight">
                                        <div className="font-black">{subj?.name || '—'}</div>
                                        {(it.direction || roomName) && (
                                          <div className="text-[10px] font-bold text-slate-500">
                                            {it.direction ? <span className="mr-2">{it.direction}</span> : null}
                                            {roomName ? <span>каб. {roomName}</span> : null}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                <div>Сформировано автоматически • Для проверки санстанции</div>
                <div className="font-mono">swaps:auto {sanitaryBase.swapsApplied} • manual {manualSwaps.length}</div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Автонастройка</div>
                  <div className="text-lg font-bold text-slate-800 dark:text-white">Итог по всем классам</div>
                </div>
                <div className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200">
                  OK: {allClassesStats.ok} / {allClassesStats.total}
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Автонастройка всегда выполняется сразу для всей недели и всех классов. Выбор класса влияет только на просмотр и ручные правки.
              </div>
              <div className="mt-4 max-h-[320px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left p-3 font-black text-xs uppercase tracking-wider text-slate-500">Класс</th>
                      <th className="text-left p-3 font-black text-xs uppercase tracking-wider text-slate-500">Смена</th>
                      <th className="text-right p-3 font-black text-xs uppercase tracking-wider text-slate-500">Замечания</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {allClassesStats.rows.map((r) => (
                      <tr
                        key={String(r.id)}
                        className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${r.id === selectedClassId ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}`}
                        onClick={() => {
                          setSelectedClassId(r.id);
                          resetManual();
                        }}
                      >
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{r.name}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{r.shift}</td>
                        <td className="p-3 text-right font-black">
                          <span className={r.violations === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                            {r.violations}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Проверка требований</div>
                  <div className="text-lg font-bold text-slate-800 dark:text-white">Статус</div>
                </div>
                <div
                  className={[
                    'px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider',
                    okViolations ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100',
                  ].join(' ')}
                >
                  {okViolations ? 'Соответствует' : 'Есть замечания'}
                </div>
              </div>

              {!isVtoXI && (
                <div className="mt-3 text-xs font-bold text-slate-500 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-3">
                  Для классов ниже V требования по “тяжёлым предметам” не применяются в полном объёме (по текущей логике проверки).
                </div>
              )}

              {analysis && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Тяжёлые на 1-м</div>
                      <div className="text-2xl font-black text-slate-800 dark:text-white">{analysis.heavyFirstCount}</div>
                      <div className="text-[10px] font-bold text-slate-500">Норма: ≤ 1 / нед.</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Тяжёлые на последнем</div>
                      <div className="text-2xl font-black text-slate-800 dark:text-white">{analysis.heavyLastCount}</div>
                      <div className="text-[10px] font-bold text-slate-500">Норма: ≤ 1 / нед.</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-700">
                    <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Нагрузка (баллы) по дням</div>
                    <div className="space-y-2">
                      {DAYS.map((d) => {
                        const v = analysis.dayLoad[d] ?? 0;
                        const isPeak = analysis.peakDay === d;
                        return (
                          <div key={String(d)} className="flex items-center gap-3">
                            <div className="w-10 text-xs font-black text-slate-600 dark:text-slate-300">{d}</div>
                            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-2 ${isPeak ? 'bg-indigo-600' : 'bg-slate-400'}`}
                                style={{ width: `${Math.min(100, (v / 70) * 100)}%` }}
                              />
                            </div>
                            <div className="w-12 text-right text-xs font-black text-slate-700 dark:text-slate-200">
                              {v.toFixed(0)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400">
                      Пик рекомендуется на Вт/Ср и/или Пт (V–XI).
                    </div>
                  </div>

                  {!okViolations && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900">
                      <div className="text-xs font-black text-red-700 dark:text-red-300 uppercase tracking-wider mb-2">Замечания</div>
                      <ul className="text-xs font-bold text-red-700 dark:text-red-200 space-y-1">
                        {analysis.violations.slice(0, 8).map((viol, idx) => (
                          <li key={idx}>
                            {viol.type === 'heavy_first_or_last_more_than_once' && (
                              <>Тяжёлые на {viol.position === 'first' ? '1-м' : 'последнем'} уроке: {viol.count} раз (норма ≤ 1)</>
                            )}
                            {viol.type === 'heavy_consecutive' && (
                              <>Тяжёлые подряд: {viol.day}, около {viol.period}-го урока</>
                            )}
                            {viol.type === 'peak_day_not_on_recommended' && (
                              <>Пик нагрузки на {viol.peakDay} (рекомендуется Вт/Ср/Пт)</>
                            )}
                          </li>
                        ))}
                      </ul>
                      {analysis.violations.length > 8 && (
                        <div className="mt-2 text-[10px] text-red-600 dark:text-red-300">…ещё {analysis.violations.length - 8}</div>
                      )}
                      <div className="mt-3 text-[10px] text-red-700/80 dark:text-red-200/80">
                        Подсказка: попробуй “Автонастройка”, а затем 1–2 обмена ячеек вокруг тяжёлых предметов (лучше на 2–4 урок).
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Сравнение</div>
              <div className="text-lg font-bold text-slate-800 dark:text-white mb-3">Действующее vs Санитарное</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Действующее</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-200">
                    Нажатия по ячейкам не влияют на это расписание.
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900">
                  <div className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-1">Для санстанции</div>
                  <div className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
                    Авто + ручные обмены • экспортируем “плакат” отсюда.
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <details className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <summary className="cursor-pointer select-none px-4 py-3 bg-white dark:bg-dark-900 font-bold text-slate-700 dark:text-slate-200">
                    Показать действующее (мини-таблица)
                  </summary>
                  <div className="p-4 bg-white dark:bg-dark-900">
                    <div className="overflow-auto">
                      <table className="w-full border-collapse border border-slate-200 dark:border-slate-700 text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800">
                            <th className="border border-slate-200 dark:border-slate-700 p-2 w-10">У</th>
                            {DAYS.map((d) => (
                              <th key={String(d)} className="border border-slate-200 dark:border-slate-700 p-2">{d}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {periods.map((p) => (
                            <tr key={String(p)}>
                              <td className="border border-slate-200 dark:border-slate-700 p-2 font-black bg-slate-50 dark:bg-slate-800">{p}</td>
                              {DAYS.map((day) => {
                                const k = slotId({ day, period: p });
                                const items = baseGrid.get(k) || [];
                                return (
                                  <td key={String(k)} className="border border-slate-200 dark:border-slate-700 p-2 align-top">
                                    {items.map((it) => {
                                      const subj = subjectsById.get(it.subjectId);
                                      return <div key={String(it.id)} className="font-bold">{subj?.name || '—'}</div>;
                                    })}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

