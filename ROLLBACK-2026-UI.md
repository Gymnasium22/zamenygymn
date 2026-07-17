# Откат UI «2026» (если на смартфоне не понравится)

Снимок **до** visual system pass:

| | |
|--|--|
| **Тег** | `pre-2026-ui` |
| **Ветка** | `backup/pre-2026-ui` |
| **Коммит** | `4af63bd` |

## Быстрый откат (локально + push + деплой)

```powershell
cd C:\Users\Acer\gymnasium-manager3
git fetch origin
git checkout main
git reset --hard pre-2026-ui
git push origin main --force
npm run deploy
```

После этого на телефоне: hard refresh PWA или «Обновить» в баннере новой версии / переустановка ярлыка.

## Без force-push (revert коммита 2026)

```powershell
git checkout main
git pull
git revert --no-edit HEAD   # если последний коммит — visual 2026
git push origin main
npm run deploy
```

## Только посмотреть старую версию

```powershell
git checkout pre-2026-ui
npm run dev
```
