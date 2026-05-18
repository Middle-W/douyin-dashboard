/**
 * 利润日报推送脚本（v9 - 今日基准模式）
 * - 对比基准：当天第一轮采集数据（.today-baseline.json）
 * - 每天第一次采集时重置基准，后续采集对比今日基准
 * - 表格样式：column_set横向布局
 * - 推送窗口：10:00 - 次日 02:00
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://nlhhktqhupqnxnjxwqzd.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5saGhrdHFodXBxbnhuanh3cXpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk5NzI1MiwiZXhwIjoyMDkzNTczMjUyfQ.WmMiO-3RATmCydfs74WhIPvtRZkMWjCi17ZMltIW7n0';

const FEISHU_APP_ID = 'cli_a96356ec03395bd6';
const FEISHU_APP_SECRET = 'nDVfF54SVO83dvU1YkudYgRx1LAnZqq4';
const FEISHU_RECEIVE_ID = 'ou_0f1f33e07223a2242b924086f73d8152';

const STATE_FILE = path.join(__dirname, '.last-profit-state.json');

const TARGET_ACCOUNTS = [
  '青森好物铺', '霜华优品', '碧落好物', '万水百货优选', '锦汐甄选',
  '飞云好物铺', '雾凇好物', '落霞优品舍', '星空好物铺', '木槿好物分享',
  '琼枝好物', '多宝严选', '桐花好物', '陆芝百货', '静幽好物',
  '温莎好物', '漫步优品', '沛灵甄选', '云天优品', '阿梨甄选',
  '浮岛百货', '星星百货推荐', '雨市好物', '锡月生活坊', '竹影好物分享',
  '潮汐优品', '宋玉甄选', '绿洲优品', '元瑶甄选', '琉光优品',
  '惠琪好物', '暗香优品', '星云好物铺', '香初优品', '青林优品',
  '盐风百货', '光遇优品', '听风百货', '云水优品', '晚霞优品',
  '水韵臻品铺', '雨墨优品'
];

function nowStr() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function getToday() {
  // 使用北京时间（UTC+8）
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().slice(0, 10);
}

// 加载上一轮状态
function loadLastState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // 检查是否是今天的状态（UTC+8）
      const now = new Date();
      const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const today = beijingTime.toISOString().slice(0, 10);
      if (data.date === today) {
        return data.accounts || {};
      }
    }
  } catch (e) {}
  return {};
}

// 保存当前状态（供下一轮对比）
function saveState(accountsMap) {
  try {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const today = beijingTime.toISOString().slice(0, 10);
    const state = {
      date: today,
      updatedAt: new Date().toISOString(),
      accounts: accountsMap
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {}
}

function formatMoney(n) {
  return (parseFloat(n) || 0).toFixed(2);
}

function profitEmoji(val) {
  const v = parseFloat(val) || 0;
  return v >= 0 ? '🟢' : '🔴';
}

// 消耗增量图标：只有大于平均值才显示🚀，其他不显示emoji
function costDeltaStr(val, avgDelta) {
  const v = parseFloat(val) || 0;
  if (v > avgDelta) {
    return `🚀 ${v.toFixed(2)}`;
  }
  return `${v.toFixed(2)}`;
}

// 利润增量图标（✅=上涨 ❌=下跌）
function profitDeltaIcon(val) {
  const v = parseFloat(val) || 0;
  if (Math.abs(v) < 1) return '';      // -1到1之间不显示emoji
  if (v > 0) return '✅';              // 利润上涨
  if (v < 0) return '❌';              // 利润下跌
  return '➖';
}

function profitDeltaStr(val) {
  const v = parseFloat(val) || 0;
  const icon = profitDeltaIcon(v);
  const iconPrefix = icon ? icon + ' ' : '';  // 有icon才加空格
  if (Math.abs(v) < 1) return `${iconPrefix}${v.toFixed(2)}`;  // -1到1直接显示数字
  if (v === 0) return `${iconPrefix}0.00`;  // 为0不显示 + 号
  const sign = v > 0 ? '+' : '';
  return `${iconPrefix}${sign}${v.toFixed(2)}`;
}

async function supabaseFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${table} error: ${res.status} ${text}`);
  }
  return res.json();
}

async function getFeishuToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET })
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu token error: ${data.msg}`);
  return data.tenant_access_token;
}

async function sendFeishuCard(token, card) {
  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: FEISHU_RECEIVE_ID,
      msg_type: 'interactive',
      content: JSON.stringify(card)
    })
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu send error: ${data.msg}`);
  return data;
}

function buildMarkdownReport(rows, totalCost, totalProfit, lossCount, totalCostDelta, totalProfitDelta, avgCostDelta, today, timeStr, isFirstRun) {
  // 计算分页
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  
  const baselineText = isFirstRun ? '今天第一轮采集（基准）' : '今天第一轮采集';
  
  let md = `📊 **利润日报 ${today}**\n\n`;
  md += `💰 **合计**：${rows.length}个账号 | 消耗 ${formatMoney(totalCost)} 元 | 利润 ${totalProfit >= 0 ? '🟢' : '🔴'} ${formatMoney(totalProfit)} 元\n`;
  if (lossCount > 0) {
    md += `🔻 **损 ${lossCount} 条**\n`;
  }
  md += `\n📈 消耗增量：${costDeltaStr(totalCostDelta, avgCostDelta)} | 利润增量：${profitDeltaStr(totalProfitDelta)} | 对比基准：${baselineText}\n\n`;
  
  // 分table显示，每页10条
  for (let page = 0; page < totalPages; page++) {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, rows.length);
    const pageRows = rows.slice(start, end);
    
    md += `**第 ${start + 1}-${end} 条**（${page + 1}/${totalPages}）\n\n`;
    md += '| 账号 | 消耗(元) | 利润(元) | 消耗增量 | 利润增量 |\n';
    md += '|------|---------|---------|---------|---------|\n';
    
    for (const row of pageRows) {
      md += `| ${row.account} | ${formatMoney(row.cost)} | ${profitEmoji(row.profit)} ${formatMoney(row.profit)} | ${costDeltaStr(row.costDelta, avgCostDelta)} | ${profitDeltaStr(row.profitDelta)} |\n`;
    }
    
    if (page < totalPages - 1) {
      md += '\n---\n\n';
    }
  }
  
  return md;
}

async function main() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  console.log(`[${nowStr()}] 利润日报推送启动，当前时间 ${timeStr}`);

  const inWindow = hour >= 10 || hour < 2;
  if (!inWindow) {
    console.log(`[${nowStr()}] ⏸️ 当前 ${timeStr} 不在推送窗口 (10:00-02:00)，跳过`);
    return;
  }

  const today = getToday();
  console.log(`[${nowStr()}] 查询日期：${today}`);

  const [todayCosts, todayStats] = await Promise.all([
    supabaseFetch('daily_costs', { date: `eq.${today}`, select: 'account_name,cost' }),
    supabaseFetch('daily_stats', { date: `eq.${today}`, select: 'account_name,net_income' })
  ]);

  console.log(`[${nowStr()}] 今天消耗=${todayCosts?.length || 0}条，佣金=${todayStats?.length || 0}条`);

  const todayCostMap = new Map((todayCosts || []).map(c => [c.account_name, parseFloat(c.cost) || 0]));
  const todayStatMap = new Map((todayStats || []).map(s => [s.account_name, parseFloat(s.net_income) || 0]));

  const allAccounts = new Set([...todayCostMap.keys(), ...todayStatMap.keys()]);

  // 只处理目标账号
  const targetAccounts = Array.from(allAccounts).filter(a => TARGET_ACCOUNTS.includes(a));
  
  if (targetAccounts.length === 0) {
    console.log(`[${nowStr()}] ⚠️ 目标账号暂无数据，跳过推送`);
    return;
  }

  console.log(`[${nowStr()}] 目标账号共 ${targetAccounts.length} 个`);

  // 加载上一轮状态
  const lastState = loadLastState();
  const isFirstRun = Object.keys(lastState).length === 0;
  
  if (isFirstRun) {
    console.log(`[${nowStr()}] 📍 今天第一次采集，设置本轮基准`);
  } else {
    console.log(`[${nowStr()}] 📊 对比上一轮计算增量`);
  }

  const rows = [];
  let totalCost = 0, totalIncome = 0, totalProfit = 0;
  let totalCostDelta = 0, totalProfitDelta = 0;

  for (const account of targetAccounts) {
    const cost = todayCostMap.get(account) || 0;
    const netIncome = todayStatMap.get(account) || 0;
    const profit = netIncome - cost;

    let costDelta, profitDelta;
    
    if (isFirstRun) {
      // 第一次采集：增量为0
      costDelta = 0;
      profitDelta = 0;
    } else {
      // 后续采集：对比上一轮
      const last = lastState[account] || { cost: 0, profit: 0 };
      costDelta = cost - last.cost;
      profitDelta = profit - last.profit;
    }

    rows.push({ account, cost, netIncome, profit, costDelta, profitDelta });

    totalCost += cost;
    totalIncome += netIncome;
    totalProfit += profit;
    totalCostDelta += costDelta;
    totalProfitDelta += profitDelta;
  }

  rows.sort((a, b) => b.cost - a.cost);

  console.log(`[${nowStr()}] 计算完成，共 ${rows.length} 个账号，总消耗=${totalCost.toFixed(2)}`);

  // 保存当前状态（供下一轮对比）
  const stateMap = {};
  for (const r of rows) {
    stateMap[r.account] = { cost: r.cost, profit: r.profit };
  }
  saveState(stateMap);
  console.log(`[${nowStr()}] ✅ 已保存本轮状态`);

  const lossCount = rows.filter(r => r.profit < 0).length;

  // 计算平均消耗增量（只统计有增量的账号）
  const positiveDeltas = rows.filter(r => r.costDelta > 0);
  const avgCostDelta = positiveDeltas.length > 0
    ? positiveDeltas.reduce((s, r) => s + r.costDelta, 0) / positiveDeltas.length
    : 0;

  console.log(`[${nowStr()}] 平均消耗增量（正向）: ${avgCostDelta.toFixed(2)}`);

  // 构建 column_set 横向布局的表格（每行2列：账号+利润 | 消耗+增量）
  const columnElements = [];
  
  for (const row of rows) {
    const costDelta = parseFloat(row.costDelta) || 0;
    const isHighDelta = costDelta > avgCostDelta;
    const deltaLabel = isHighDelta ? '**增量:**' : '增量:';
    
    columnElements.push({
      tag: 'column_set',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 2,
          elements: [
            { tag: 'div', text: { tag: 'lark_md', content: `**${row.account}**\n利润: ${profitEmoji(row.profit)} ${formatMoney(row.profit)}` } }
          ]
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 3,
          elements: [
            {
              tag: 'column_set',
              columns: [
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 1,
                  elements: [
                    { tag: 'div', text: { tag: 'lark_md', content: `消耗:` } }
                  ]
                },
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 3,
                  elements: [
                    { tag: 'div', text: { tag: 'lark_md', content: `${formatMoney(row.cost)} 元` } }
                  ]
                }
              ]
            },
            {
              tag: 'column_set',
              columns: [
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 1,
                  elements: [
                    { tag: 'div', text: { tag: 'lark_md', content: deltaLabel } }
                  ]
                },
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 3,
                  elements: [
                    { tag: 'div', text: { tag: 'lark_md', content: `${Math.abs(costDelta).toFixed(2)} | ${profitDeltaStr(row.profitDelta)}` } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });
  }

  const card = {
    config: {
      wide_screen_mode: true
    },
    header: {
      title: { tag: 'plain_text', content: `📊 利润日报 ${today}` },
      subtitle: { tag: 'plain_text', content: `推送时间：${timeStr} | 共 ${rows.length} 个账号` }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `💰 **合计**：${rows.length}个账号 | 消耗 ${formatMoney(totalCost)} 元 | 利润 ${totalProfit >= 0 ? '🟢' : '🔴'} ${formatMoney(totalProfit)} 元${lossCount > 0 ? ` | 🔻 损 ${lossCount} 条` : ''}`
        }
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `📈 消耗增量：${costDeltaStr(totalCostDelta, avgCostDelta)} | 利润增量：${profitDeltaStr(totalProfitDelta)} | 对比基准：${isFirstRun ? '今天第一轮采集（基准）' : '今天第一轮采集'}`
        }
      },
      { tag: 'hr' },
      ...columnElements
    ]
  };

  const token = await getFeishuToken();
  await sendFeishuCard(token, card);
  console.log(`[${nowStr()}] ✅ 推送成功！展示 ${rows.length}/${rows.length} 个账号`);
}

main().catch(err => {
  console.error(`[${nowStr()}] ❌ 错误:`, err.message);
  process.exit(1);
});
