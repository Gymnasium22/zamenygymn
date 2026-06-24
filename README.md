# 🎓 Гимназия Pro22 - Система управления расписанием

[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4.2-blue.svg)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-11.6.0-orange.svg)](https://firebase.google.com/)
[![Vite](https://img.shields.io/badge/Vite-6.3.5-646CFF.svg)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/PWA-Ready-green.svg)](https://web.dev/progressive-web-apps/)

Современная веб-система для управления расписанием, заменами и справочниками гимназии №22.

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
   Создайте файл `.env.local`:
   ```env
   # Firebase конфигурация
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

   # Опционально: Telegram бот
   VITE_TELEGRAM_BOT_TOKEN=your_bot_token
   ```

4. **Запустите приложение:**
   ```bash
   npm run dev
   ```

Приложение будет доступно по адресу: `http://localhost:5173`

## 📱 PWA и мобильная версия

Приложение поддерживает установку как PWA на мобильные устройства и десктопы. После первого запуска в браузере появится предложение установить приложение.

## 🔐 Аутентификация

Приложение поддерживает три типа пользователей:
- **Администратор** - полный доступ ко всем функциям
- **Учитель** - ограниченный доступ (расписание, дежурство)
- **Гость** - только просмотр расписания

## 🛠 Технологии

- **Frontend:** React 18, TypeScript, Tailwind CSS
- **Backend:** Firebase Firestore, Firebase Auth
- **Build:** Vite 6
- **Tests:** Vitest 4
- **PWA:** Workbox, Vite PWA Plugin
- **UI Components:** Custom компоненты с Heroicons
- **Charts:** BarChart компоненты для отчетов

## 📁 Структура проекта

```
src/
├── components/          # Переиспользуемые компоненты
│   ├── Icons.tsx       # Иконки и компоненты иконок
│   └── UI.tsx          # UI компоненты (Modal, Select, etc.)
├── context/            # React Context для состояния
│   ├── AuthContext.tsx # Аутентификация
│   └── DataContext.tsx # Данные приложения
├── pages/              # Страницы приложения
│   ├── Login.tsx       # Вход в систему
│   ├── Dashboard.tsx   # Рабочий стол
│   ├── Schedule.tsx    # Расписание
│   ├── Substitutions.tsx # Замены
│   ├── Directory.tsx   # Справочники
│   ├── Reports.tsx     # Отчеты
│   └── Admin.tsx       # Администрирование
├── services/           # Сервисы
│   ├── db.ts          # Работа с Firebase
│   └── firebase.ts    # Конфигурация Firebase
├── types.ts           # TypeScript типы
└── constants.ts       # Константы и начальные данные
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

### Проблемы с Firebase
- Убедитесь, что все переменные окружения правильно установлены
- Проверьте правила Firestore на корректность

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

- **Организация:** Гимназия №22
- **Разработчик:** Команда разработки
- **Email:** admin@gymnasium22.com

---

*Создано с ❤️ для Гимназии №22*