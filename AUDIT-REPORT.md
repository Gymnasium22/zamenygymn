# 🔍 Полный аудит приложения "Гимназия Pro22"

**Дата аудита:** 2026-05-11  
**Объём кодовой базы:** ~16,230 строк TypeScript/TSX  
**Стек:** React 18, TypeScript 5.4, Vite 5, Firebase 10, Tailwind CSS 3, PWA  
**Среда деплоя:** GitHub Pages (`https://Gymnasium22.github.io/zamenygymn/`)

---

## 📋 Содержание
1. [Общая информация](#1-общая-информация)
2. [🔴 Критические проблемы безопасности](#2-критические-проблемы-безопасности)
3. [🟠 Архитектура и качество кода](#3-архитектура-и-качество-кода)
4. [🟡 Производительность](#4-производительность)
5. [🔵 PWA, сборка и деплой](#5-pwa-сборка-и-деплой)
6. [🟣 Детальный аудит по файлам](#6-детальный-аудит-по-файлам)
7. [📊 Итоговая оценка и приоритеты](#7-итоговая-оценка-и-приоритеты)

---

## 1. Общая информация

### Что это за приложение
Система управления расписанием для гимназии №22 (Минск): расписание занятий, замены учителей, дежурства, питание, пропуски учащихся, отчёты и администрирование.

### Структура проекта
```
src/
├── components/          # UI-компоненты (~2,500 строк)
├── context/            # React Context (Auth + Data) (~800 строк)
├── pages/              # Страницы (~8,000 строк)
├── services/           # Firebase, экспорт, погода (~800 строк)
├── utils/              # Хелперы и санитарный анализ (~1,200 строк)
├── types.ts            # TypeScript типы
├── constants.ts        # Константы и дефолтные данные
└── App.tsx             # Роутинг и layout
```

### Ключевые метрики
| Показатель | Значение | Оценка |
|-----------|----------|--------|
| Количество страниц | 12 | — |
| Средний размер страницы | ~900 строк | ⚠️ Высокий |
| Самая большая страница | `Export.tsx` (1,893 строк) | 🔴 Критично |
| Тесты | **0** | 🔴 Отсутствуют |
| ESLint правил отключено | 7 из 10 | 🔴 Фактически выключен |
| Зависимости (production) | 8 | ✅ Минимум |

---

## 2. 🔴 Критические проблемы безопасности

### 2.1. API-ключи Firebase в репозитории
**Файл:** `.env` (строки 1–6)  
**Проблема:** Файл `.env` содержит реальные Firebase credentials и **закоммичен в Git** (несмотря на `.gitignore`).
```
VITE_FIREBASE_API_KEY=AIzaSyA-lCfZRMFfLjdG4vg3JnPWMAXq_6zgl5I
VITE_FIREBASE_PROJECT_ID=zameny-b6c3f
```
**Риск:** Любой, у кого есть доступ к репозиторию, может использовать эти ключи. Firebase API Keys нельзя полностью скрыть в клиентском приложении, но их публикация в открытом репозитории упрощает злоупотребления.

**Действие:**
1. Немедленно отозвать ключ в Firebase Console
2. Сгенерировать новый
3. Удалить `.env` из истории Git (`git filter-repo` или BFG Repo-Cleaner)
4. Настроить secrets через GitHub Actions / переменные окружения

### 2.2. Telegram Bot Token доступен на клиенте
**Файл:** `src/pages/Dashboard.tsx` (~строка 634), `src/pages/Admin.tsx`  
**Проблема:** `settings.telegramToken` читается из Firestore и используется для прямых запросов к `api.telegram.org` с клиента. Любой авторизованный пользователь (teacher/canteen) может извлечь токен из Network/DevTools.

**Риск:** Полный контроль над Telegram-ботом: отправка сообщений от имени бота, получение истории чатов, доступ к `chat_id` всех учителей.

**Действие:** Все запросы к Telegram API должны идти через Cloud Functions / backend proxy. Токен должен храниться только в `secrets` и недоступен для чтения с клиента.

### 2.3. Жёстко закодированные учётные данные
**Файл:** `src/context/AuthContext.tsx` (строки 17–19)
```typescript
const ADMIN_EMAIL = 'admin@gymnasium22.com';
const TEACHER_EMAIL = 'teacher@gymnasium22.com';
const CANTEEN_EMAIL = 'canteen@gymnasium22.com';
```
**Файл:** `firestore.rules` (множественные проверки `request.auth.token.email == "admin@gymnasium22.com"`)

**Проблема:** Ролевая модель построена на проверке email-адреса. Любой, кто знает эти email'ы и пароли (или сможет их сбросить через Firebase), получит административный доступ. Нет granular permissions, нет custom claims.

**Действие:** Перейти на Firebase Custom Claims для ролей. Email'ы не должны быть единственным фактором авторизации.

### 2.4. Firestore Rules — избыточные права
**Файл:** `firestore.rules`
- `nutrition_records`: `allow write: if request.auth != null && request.auth.token.email != "canteen@gymnasium22.com"` — любой авторизованный пользователь, кроме столовой, может писать.
- `/{document=**}`: админ может писать **в любую коллекцию**, включая потенциально новые/забытые.

**Риск:** Компрометация одного аккаунта teacher → полная компрометация данных.

### 2.5. Подозрительный importmap в сборке
**Файл:** `dist/index.html`
```html
<script type="importmap">
{
  "imports": {
    "react": "https://aistudiocdn.com/react@^19.2.0",
    ...
  }
}
</script>
```
**Проблема:** В собранном HTML присутствует сторонний CDN `aistudiocdn.com`, который перехватывает импорты. Это **не является стандартным выводом Vite build**. Возможно:
- Подмена сборки сторонним инструментом
- Остатки эксперимента/плагина
- Потенциальный вектор supply chain attack

**Действие:** Проверить процесс сборки. Пересобрать чистым `vite build` и сравнить.

---

## 3. 🟠 Архитектура и качество кода

### 3.1. Монолитные компоненты-"боги"
| Страница | Строк | Проблема |
|----------|-------|----------|
| `Export.tsx` | 1,893 | 3 копии логики экспорта, компоненты определены внутри компонента |
| `Substitutions.tsx` | 1,602 | Прямая мутация state, дублирование Telegram-логики |
| `Schedule.tsx` | 1,485 | Mutable Map в state, DOM-мутации в DnD, тройное дублирование рендера |
| `Dashboard.tsx` | 1,261 | JSON.parse без try/catch, Telegram token на клиенте |
| `Bells.tsx` | 814 | — |

**Рекомендация:** Разбить каждую страницу на субкомпоненты и кастомные хуки. Целевой размер компонента: <300 строк.

### 3.2. Отключённый ESLint
**Файл:** `eslint.config.js`
```javascript
'@typescript-eslint/no-unused-vars': 'off',
'@typescript-eslint/no-explicit-any': 'off',
'react-hooks/exhaustive-deps': 'off',
'react-hooks/rules-of-hooks': 'off',
'react-refresh/only-export-components': 'off',
```
**Проблема:** Практически все важные правила отключены. В коде десятки `any`, неиспользуемых переменных, нарушений правил хуков.

### 3.3. Дублирование кода
- **3 копии логики отображения расписания:** `Schedule.tsx` (десктоп), `Schedule.tsx` (мобайл), `Export.tsx` (print overlay)
- **2 копии экспорта Excel:** `exportMatrixExcel` и `exportPosterMatrixExcel` отличаются только CSS
- **2 копии скачивания PNG:** `handleDownloadPngShift1` и `handleDownloadPngShift2`
- **Дублирование Telegram fetch:** `sendSummaryToTelegram` и `confirmSendTelegram`

### 3.4. Прямая мутация состояния React
**Файл:** `src/pages/Substitutions.tsx`
```typescript
// Строки ~267–282, ~289–344, ~346–359
teacher.absenceReasons[selectedDate] = absenceReason;  // мутация!
delete teacher.absenceReasons[selectedDate];           // мутация!
```
Хотя `teacher` создаётся через spread, `absenceReasons` — тот же объект по ссылке. React не детектит изменение, и оптимизации контекста ломаются.

**Файл:** `src/pages/Substitutions.tsx` (~строка 628)
```typescript
subs.sort((a, b) => ...); // .sort() мутирует массив!
```

### 3.5. Антипаттерн: компоненты внутри компонентов
**Файл:** `src/pages/Export.tsx` (строки 1326–1513)
```typescript
const ExportPage = () => {
  const ReportHeader = () => <...>;        // ❌ Новый тип на каждый рендер
  const MatrixPrintContent = () => <...>;  // ❌ React размонтирует всё дерево
  // ...
};
```
На каждый рендер `ExportPage` создаётся **новый тип компонента**. React видит его как другой элемент и полностью размонтирует/пересоздаёт DOM поддерева.

### 3.6. Race conditions
**Файл:** `src/pages/Login.tsx` (строки 17–23 и 72–75)
```typescript
// useEffect перенаправляет на /dashboard при любом role
useEffect(() => { if (role) navigate('/dashboard'); }, [role]);

// handleParentLogin делает setGuestRole() + navigate('/schedule')
// Если setGuestRole асинхронно обновит контекст, useEffect перебьёт navigate
```

**Файл:** `src/pages/Substitutions.tsx` (строки 1077–1084)
```typescript
// toggleRefusal использует замыкание на текущее значение
setRefusedTeacherIds([...refusedTeacherIds, teacherId]);
// При быстром двойном клике оба вызова видят одно и то же начальное состояние
```

### 3.7. Отсутствие валидации входных данных
**Файл:** `src/pages/Export.tsx` (строки 120–151)
```typescript
const mergedData = { ...INITIAL_DATA, ...JSON.parse(content) } as any;
```
Импорт JSON происходит без валидации схемы. Повреждённый файл может сломать приложение полностью.

---

## 4. 🟡 Производительность

### 4.1. Алгоритмическая сложность O(n³) в Schedule.tsx
**Файл:** `src/pages/Schedule.tsx` (строки 655–745)
```typescript
// Для КАЖДОЙ ячейки таблицы (50 классов × 8 периодов × 5 дней = 2000 ячеек):
const subject = subjects.find(s => s.id === item.subjectId);      // O(S)
const teacher = teachers.find(t => t.id === item.teacherId);      // O(T)
const conflicts = checkConflicts(item);                            // O(N) — filter по всему schedule!
```
Итого: до **миллионов операций** на один рендер. Таблица будет лагать при >1000 записей.

**Решение:** Построить `Map` (id → entity) один раз за рендер. Вынести `checkConflicts` в `useMemo` с мемоизацией по ключу.

### 4.2. Export.tsx — 4 миллиона операций фильтрации
**Файл:** `src/pages/Export.tsx` (строки 979–1012)
```typescript
DAYS.forEach(day => {
  shifts.forEach(shift => {
    classes.forEach(cls => {
      periods.forEach(period => {
        const lesson = schedule.filter(s => s.day === day && s.shift === shift && ...)
      })
    })
  })
})
```
Вложенные циклы с `filter` внутри. Для типичной школы — ~4 млн операций.

**Решение:** Предварительно сгруппировать `schedule` в `Map<"day|shift|class|period", ScheduleItem>`.

### 4.3. Substitutions.tsx — O(n·m) поиск замен
**Файл:** `src/pages/Substitutions.tsx` (строки 243–258)
```typescript
affectedLessons.forEach(lesson => {
  const subs = substitutions.filter(s => s.scheduleItemId === lesson.id);
  // Для каждого урока — полный проход по всем заменам
});
```
**Решение:** `useMemo(() => new Map(substitutions.map(s => [s.scheduleItemId, s]))`.

### 4.4. Dashboard.tsx — неоптимальный live-search
**Файл:** `src/pages/Dashboard.tsx` (строки 288–501)
```typescript
teachers.forEach(t => {
  schedule.find(s => s.teacherId === t.id);           // O(N)
  substitutions.find(s => s.originalTeacherId === ...); // O(M)
});
```
Трижды дублируется одинаковая логика для teachers/classes/rooms.

### 4.5. Mutable Map в state — бесполезный кэш
**Файл:** `src/pages/Schedule.tsx` (строки 120–133)
```typescript
const [scheduleItemsCache, setScheduleItemsCache] = useState(new Map());
useEffect(() => {
  if (scheduleItemsCache.size > 500) scheduleItemsCache.clear();
}, [schedule, scheduleItemsCache]);
```
- `scheduleItemsCache` никогда не меняется как state-объект (тот же Map)
- `useEffect` срабатывает на каждый рендер
- Кэш раздувается до 500, потом резко очищается — thrashing

### 4.6. getScheduleForDate ломает useMemo
**Файл:** `src/pages/Export.tsx` (строки 99–102)
```typescript
const getScheduleForDate = (date: Date, ...) => { ... }; // создаётся заново каждый рендер
// useMemo зависит от этой функции → useMemo никогда не кешируется
```

### 4.7. Лишние ререндеры контекста
**Файл:** `src/context/DataContext.tsx`
```typescript
const contextValue = useMemo(() => ({ ... }), [data, isLoading, isSaving, saveData, ...]);
```
`saveData` пересоздаётся при каждом изменении `data` (почти всегда). Все потребители `useStaticData` и `useScheduleData` ререндерятся при любом чихе.

---

## 5. 🔵 PWA, сборка и деплой

### 5.1. Проблемы PWA-конфигурации
| Проблема | Файл | Риск |
|----------|------|------|
| Отсутствует `viewport-fit=cover` | `index.html` | На iPhone X+ контент не доходит до краёв экрана |
| Нет `lang: 'ru'` в манифесте | `vite.config.ts` | Lighthouse штраф |
| `purpose: 'any maskable'` на одной иконке | `vite.config.ts` | Иконка может обрезаться на Android |
| Нет `cacheableResponse` для Firebase | `vite.config.ts` | Можно закэшировать CORS-ошибку |
| Отсутствуют `favicon.ico`, `apple-touch-icon.png` | `public/` | 404-запросы при старте |

### 5.2. Open Graph / SEO
**Файл:** `index.html`
- Нет `og:title`, `og:description`, `og:image`
- При шеринге ссылки в мессенджерах превью будет пустым

### 5.3. Сборка
- `dist/index.html` содержит подозрительный `<script type="importmap">` от `aistudiocdn.com` (см. раздел 2.5)
- Бандл не анализировался, но `html2canvas` + `jspdf` стоит загружать лениво (`React.lazy` / dynamic import)

---

## 6. 🟣 Детальный аудит по файлам

### `src/App.tsx` (402 строки)
- ✅ Хорошая структура роутинга с `HashRouter` (корректно для GitHub Pages)
- ✅ Role-based доступ к страницам
- ⚠️ `safeLocalStorageGet` / `safeLocalStorageSet` дублируются из `DataContext.tsx`
- ⚠️ `SchedulePageWrapper` определён внизу файла после экспорта — работает, но нечитаемо

### `src/context/AuthContext.tsx` (79 строк)
- 🔴 Email'ы ролей захардкожены (строки 17–19)
- 🔴 `setGuestRole` не создаёт пользователя в Firebase — "гость" — это просто локальный state
- ⚠️ `dbService.clearCache()` при logout — хорошо, но кэш `DataContext` в `localStorage` остаётся

### `src/context/DataContext.tsx` (693 строки)
- ✅ Продуманная offline-логика: очередь синхронизации, localStorage backup
- ✅ History (undo/redo) с лимитом 50 шагов
- ⚠️ `syncQueue` — глобальный mutable объект (не критично, но нечисто)
- ⚠️ `setHistory` внутри `setInternalData` callback — возможен stale state
- ⚠️ `handleError.firebaseOffline` всегда добавляет в очередь, даже если ошибка не связана с сетью

### `src/services/db.ts` (537 строк)
- ✅ Оптимизированная синхронизация через `writeBatch` (чанки по 450)
- ✅ Локальный кэш коллекций для дедупликации
- ✅ `sanitizeForFirestore` для совместимости
- ⚠️ `awaitHZ` — костыль для обработки квоты. Лучше использовать exponential backoff
- ⚠️ `deepEqual` не обрабатывает `Date`, `Map`, `Set`
- ⚠️ `exportJson` создаёт blob, но не очищает `URL.createObjectURL` после скачивания (утечка памяти)

### `src/services/firebase.ts` (40 строк)
- ✅ Корректная инициализация с проверкой `getApps().length`
- ⚠️ Консольный лог `Firebase initialized` в production

### `src/services/weatherService.ts` (89 строк)
- ✅ Кэширование в localStorage с TTL 30 минут
- ⚠️ Нет обработки `city` с пробелами (`encodeURIComponent`)
- ⚠️ API-ключ погоды хранится в `settings` (Firestore) — доступен всем авторизованным

### `src/components/UI.tsx` (1,016 строк)
- ✅ Хороший `ToastProvider` с CustomEvents
- ✅ `CommandPalette` с клавиатурной навигацией
- ✅ `StatusWidget` с отслеживанием online/offline
- ⚠️ `SearchableSelect` не поддерживает ` Escape` для закрытия при фокусе на input
- ⚠️ `Modal` блокирует `body.overflow`, но не восстанавливает при unmount компонента (если модалка убита не через `isOpen=false`)

### `src/components/Icons.tsx` (1,025 строк)
- ⚠️ Все 60+ иконок в одном файле. Лучше разбить или использовать `lucide-react` (уже есть в зависимостях `qrcode.react`)
- ⚠️ `Flower` — очень сложный SVG (~20 path), возможно не используется

### `src/pages/Login.tsx` (275 строк)
- 🔴 Race condition между `useEffect` и `handleParentLogin` (см. 3.6)
- ⚠️ 4 кнопки входа дублируют структуру — должны быть массивом конфигурации

### `src/pages/Schedule.tsx` (1,485 строк)
- 🔴 Mutable Map в state
- 🔴 Прямая DOM-мутация в Drag-and-Drop (`classList.add('dragging')`)
- 🔴 `checkConflicts` вызывается для каждой ячейки без мемоизации
- ⚠️ `confirm()` блокирует UI
- ⚠️ `as string` вместо проверок типов

### `src/pages/Substitutions.tsx` (1,602 строк)
- 🔴 Прямая мутация `teacher.absenceReasons`
- 🔴 Нет проверки `response.ok` при запросах к Telegram API
- 🔴 `subs.sort()` мутирует отфильтрованный массив
- ⚠️ `replace()` вместо `replaceAll()` для шаблонов — заменяет только первое вхождение
- ⚠️ `toggleRefusal` без функционального обновления state

### `src/pages/Export.tsx` (1,893 строк)
- 🔴 Компоненты определены внутри `ExportPage` (ломает reconciliation)
- 🔴 Импорт JSON без валидации схемы
- 🔴 `copyForGoogleSheets` — ~4 млн операций
- ⚠️ `html2canvas` импортирован синхронно — тяжёлый бандл

### `src/pages/Dashboard.tsx` (1,261 строк)
- 🔴 Telegram token на клиенте
- 🔴 `JSON.parse(saved)` без `try/catch`
- ⚠️ Огромный `useEffect` для live-search
- ⚠️ `addToast({ message: \`Ошибка: ${error}\` })` — `error` может быть объектом

### `src/pages/Admin.tsx` (624 строки)
- ⚠️ `useEffect` не отслеживает `privateSettings` — токен может не загрузиться
- ⚠️ `Number(e.target.value)` → `NaN` при нечисловом вводе
- ⚠️ Дублирование UI для выбора смены/периода

### `src/utils/sanitarySchedule.ts` (1,138 строк)
- ✅ Хорошая типизация и структура
- ✅ Не мутирует входные данные (`resultItems = baseSchedule.map(x => ({...x}))`)
- ⚠️ Сложный алгоритм без юнит-тестов — невозможно гарантировать корректность
- ⚠️ `maxIterations = 100000` — потенциально блокирует главный поток на секунды

---

## 7. 📊 Итоговая оценка и приоритеты

### Оценки по категориям

| Категория | Оценка (1–10) | Статус |
|-----------|---------------|--------|
| Безопасность | **3/10** | 🔴 Критично |
| Производительность | **4/10** | 🔴 Критично |
| Качество кода | **4/10** | 🟠 Требует внимания |
| Архитектура | **5/10** | 🟠 Требует рефакторинга |
| PWA / Сборка | **6/10** | 🟡 Есть недочёты |
| UX / Доступность | **6/10** | 🟡 Хорошая база |
| Тестирование | **1/10** | 🔴 Отсутствует |
| Документация | **5/10** | 🟡 README есть, AGENTS.md нет |

### Приоритеты действий

#### 🔴 P0 — Немедленно (блокер для production)
1. **Отозвать Firebase API Key** — `.env` в репозитории
2. **Удалить `.env` из истории Git**
3. **Убрать Telegram Token с клиента** — перенести отправку на backend/Cloud Functions
4. **Проверить `aistudiocdn.com` importmap** в `dist/index.html`
5. **Исправить прямую мутацию state** в `Substitutions.tsx`

#### 🟠 P1 — В ближайшие 2 недели
6. Разбить страницы на компоненты (<300 строк)
7. Починить ESLint: включить `react-hooks/exhaustive-deps`, `no-explicit-any`
8. Оптимизировать `Schedule.tsx`: `Map` для entities, мемоизация `checkConflicts`
9. Исправить `Export.tsx`: вынести компоненты из тела, сгруппировать schedule в Map
10. Добавить валидацию импорта JSON (Zod / JSON Schema)

#### 🟡 P2 — В ближайший месяц
11. Написать юнит-тесты для `sanitarySchedule.ts` (критичный алгоритм!)
12. Добавить интеграционные тесты для авторизации и сохранения данных
13. Перейти на Firebase Custom Claims для ролей
14. Ленивая загрузка `html2canvas` и `jspdf`
15. Добавить `viewport-fit=cover` и OG-теги

#### 🟢 P3 — Техдолг
16. Заменить кастомные SVG на `lucide-react`
17. Вынести repeated UI-паттерны (label + input) в отдельные компоненты
18. Добавить Error Boundaries
19. Настроить Sentry или аналог для отслеживания ошибок в production
20. Рассмотреть переход на Zustand или Redux Toolkit вместо split Context'ов

---

*Аудит проведён автоматически с ручным анализом критических участков. Рекомендуется провести security review после устранения P0-проблем.*
