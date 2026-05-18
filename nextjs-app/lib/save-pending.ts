import fs from 'fs';
import path from 'path';

const PENDING_DIR = path.join('/tmp', 'douyin-pending-errors');

function ensureDir() {
  if (!fs.existsSync(PENDING_DIR)) {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
  }
}

export function savePending(
  type: 'stats' | 'costs',
  date: string,
  data: any[],
  error: string,
  unmatched?: string[]
) {
  try {
    ensureDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${type}-${date}-${timestamp}.json`;
    const payload = {
      type,
      date,
      createdAt: new Date().toISOString(),
      data,
      error,
      unmatched: unmatched || [],
    };
    fs.writeFileSync(path.join(PENDING_DIR, filename), JSON.stringify(payload, null, 2), 'utf8');
    return filename;
  } catch (e) {
    console.error('Failed to save pending:', e);
    return null;
  }
}
