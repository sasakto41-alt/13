/**
 * Гарантирует наличие папки data/ для файла базы SQLite (data/panel.db).
 * Вызывается автоматически перед prisma db push (npm run dev / npm start / npm run setup).
 * Кроссплатформенно (Windows/Linux/macOS), без внешних зависимостей.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

try {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Папка базы данных готова: ' + path.relative(root, dataDir));
} catch (e) {
  console.error('Не удалось создать папку data/:', e);
  process.exit(1);
}
