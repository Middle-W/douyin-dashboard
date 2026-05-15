import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    // Query Windows Task Scheduler - get user-level tasks (non-system)
    const output = execSync('schtasks /query /fo CSV /v', { encoding: 'utf-8', timeout: 15000 });

    // Parse CSV output
    const lines = output.trim().split('\r\n');
    if (lines.length < 2) {
      return NextResponse.json({ tasks: [] }, { headers: corsHeaders });
    }

    // CSV header - support both English and Chinese Windows
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

    const taskNameIdx = headers.findIndex(h => h === 'TaskName' || h === '任务名');
    const statusIdx = headers.findIndex(h => h === 'Task Status' || h === '计划任务状态');
    const lastRunIdx = headers.findIndex(h => h === 'Last Run Time' || h === '上次运行时间');
    const nextRunIdx = headers.findIndex(h => h === 'Next Run Time' || h === '下次运行时间');

    const tasks: Array<{ taskName: string; status: string; lastRunTime: string; nextRunTime: string }> = [];

    // Skip header line, parse each row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Simple CSV parsing - split by comma, handle quoted values
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const taskName = taskNameIdx >= 0 ? values[taskNameIdx]?.replace(/^"|"$/g, '').trim() : '';
      const status = statusIdx >= 0 ? values[statusIdx]?.replace(/^"|"$/g, '').trim() : '';
      const lastRunTime = lastRunIdx >= 0 ? values[lastRunIdx]?.replace(/^"|"$/g, '').trim() : '';
      const nextRunTime = nextRunIdx >= 0 ? values[nextRunIdx]?.replace(/^"|"$/g, '').trim() : '';

      // Filter out empty and system tasks
      if (!taskName || taskName.startsWith('\\Microsoft')) continue;
      // Skip disabled/completed tasks without next run time (old tasks)
      // Support both English and Chinese status values
      const isDisabled = status === 'Disabled' || status === '已禁用';
      const isNARunTime = !nextRunTime || nextRunTime === 'N/A' || nextRunTime === 'N/A';
      if (isDisabled && isNARunTime) continue;

      tasks.push({
        taskName,
        status: status || 'Unknown',
        lastRunTime: lastRunTime || '—',
        nextRunTime: nextRunTime || '—',
      });
    }

    // Sort: Ready (就绪) first, then by task name
    const isReady = (s: string) => s === 'Ready' || s === '就绪';
    tasks.sort((a, b) => {
      if (isReady(a.status) && !isReady(b.status)) return -1;
      if (isReady(b.status) && !isReady(a.status)) return 1;
      return a.taskName.localeCompare(b.taskName);
    });

    return NextResponse.json({ tasks }, { headers: corsHeaders });

  } catch (err: any) {
    console.error('Scheduled tasks error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to query scheduled tasks' },
      { status: 500, headers: corsHeaders }
    );
  }
}
