# 🎓 Управление учреждением

[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4.2-blue.svg)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E.svg)](https://supabase.com/)
[![Vite](https://img.shields.io/badge/Vite-6.3.5-646CFF.svg)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/PWA-Ready-green.svg)](https://web.dev/progressive-web-apps/)

Современная веб-система для управления расписанием, заменами и справочниками образовательных учреждений (поддержка нескольких организаций).

## ✨ Возможности

### 📅 Управление расписанием
- Создание и редактирование расписания для 1-го и 2-го семестров
- Поддержка двух смен (1-я и 2-я смена)
- Визуальное отображение конфликтов (учитель/класс/кабинет)
- Drag & Drop для быстрого перемещения уроков

### 👥 Справочники
- Управление учителями, предметами, классами и кабинетами
- Настройка сложности предметов и типов кабинетов
- Группировка кабинетов по зонам дежурства

### 🔄 Замены и отсутствия
- Регистрация отсутствий учителей
- Автоматический поиск свободных замен
- Управление заменами с учетом нагрузки

### 📊 Отчеты и аналитика
- Статистика нагрузки учителей
- Анализ использования кабинетов
- СанПиН анализ загруженности классов

### 🔧 Администрирование
- Настройка семестров и расписания звонков
- Управление пользователями и правами доступа
- Экспорт и импорт данных
- Telegram интеграция для уведомлений

## 🚀 Быстрый старт

### Предварительные требования
- **Node.js** 18+
- **npm** или **yarn**

### Установка

1. **Клонируйте репозиторий:**
   ```bash
   git clone <repository-url>
   cd gymnasium-manager3
   ```

2. **Установите зависимости:**
   ```bash
   npm install
   ```

3. **Настройте переменные окружения:**
   Скопируйте `.env.example` → `.env` и заполните:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Запустите приложение:**
   ```bash
   npm run dev
   ```

Приложение будет доступно по адресу: `http://localhost:5173`

## 📱 PWA и мобильная версия

Приложение поддерживает установку как PWA на мобильные устройства и десктопы. После первого запуска в браузере появится предложение установить приложение.

## 🔐 Аутентификация

Supabase Auth + таблица `profiles`. Роли:
- **superadmin** — все организации
- **admin** — полное управление организацией
- **teacher** — ограниченный доступ
- **canteen** — питание

## 🛠 Технологии

- **Frontend:** React 18, TypeScript, Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Realtime, RLS)
- **Build:** Vite 6
- **Tests:** Vitest 4
- **PWA:** Workbox, Vite PWA Plugin

## 📁 Структура проекта

```
src/
├── components/          # UI-компоненты
├── context/             # AuthContext, DataContext
├── pages/               # Страницы приложения
├── services/
│   ├── supabase.ts      # Клиент Supabase
│   ├── dbSupabase.ts    # Загрузка/сохранение данных
│   ├── authAdapter.ts   # Auth API
│   └── supabase/        # Users, settings, …
└── …
supabase/
├── migrations/          # SQL-миграции
└── rls_policies.sql     # RLS (справочно)
```

## 🔧 Скрипты

```bash
# Разработка
npm run dev          # Запуск dev сервера
npm run build        # Сборка для продакшена
npm run preview      # Предпросмотр сборки

# Деплой
npm run predeploy    # Подготовка к деплою
npm run deploy       # Деплой на GitHub Pages
```

## 🚢 Деплой

Приложение настроено для автоматического деплоя на GitHub Pages:

1. Настройте GitHub Actions в репозитории
2. При пуше в main ветку произойдет автоматический деплой
3. Приложение будет доступно по адресу: `https://username.github.io/repository-name`

## 🐛 Устранение неполадок

### Проблемы с Supabase
- Проверьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` в `.env`
- Убедитесь, что пользователь имеет `organization_id` в `profiles`
- При ошибках прав проверьте RLS-политики

### Проблемы с PWA
- Очистите кеш браузера
- Переустановите PWA приложение

### Проблемы с производительностью
- Проверьте использование памяти в DevTools
- Убедитесь, что отключены неиспользуемые подписки

## 🤝 Вклад в развитие

1. Fork репозиторий
2. Создайте feature ветку: `git checkout -b feature/amazing-feature`
3. Зафиксируйте изменения: `git commit -m 'Add amazing feature'`
4. Push в ветку: `git push origin feature/amazing-feature`
5. Создайте Pull Request

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).

## 📞 Контакты

- **Продукт:** Управление учреждением
- **Разработчик:** Команда разработки

---

*Создано с ❤️ для Гимназии №22*