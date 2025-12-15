// Скрипт для генерации иконок PWA
// Требует: npm install sharp
// Запуск: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Простая инструкция для ручной генерации
console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Инструкция по созданию иконок для PWA                      ║
╚══════════════════════════════════════════════════════════════╝

1. Используйте онлайн-генератор:
   - https://www.pwabuilder.com/imageGenerator
   - https://realfavicongenerator.net/
   - https://favicon.io/favicon-generator/

2. Или используйте icon.svg из папки public/:
   - Откройте public/icon.svg в графическом редакторе
   - Экспортируйте как PNG в размерах:
     * 192x192 px → сохраните как icon-192.png
     * 512x512 px → сохраните как icon-512.png

3. Поместите файлы в папку public/:
   - public/icon-192.png
   - public/icon-512.png

4. После этого пересоберите проект:
   npm run build

Требуемые размеры:
- 192x192 px (минимум для Android)
- 512x512 px (для установки на рабочий стол и Android)

Цветовая схема:
- Основной цвет: #4f46e5 (indigo-600)
- Фон: белый или прозрачный
`);








