/**
 * 抖川自动化数据抓取脚本 (Playwright)
 * 页面: https://dy.douchuanec.com/#/qy_balance
 *
 * 安装: cd scripts && npm install
 * 首次: node fetch-douchuan.js (打开浏览器手动登录，登录后等待自动保存)
 * 后续: node fetch-douchuan.js (全自动)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '.douchuan-state.json');

const CONFIG = {
  douchuanUrl: 'https://dy.douchuanec.com/#/qy_balance',
  apiUrl: process.env.API_URL || 'http://localhost:3000/api/import-cost-json',
  date: process.env.FETCH_DATE || getYesterday(),
  chromePath: process.env.CHROME_PATH || findChrome(),
  headless: process.env.HEADLESS === 'true',
  pageDelay: 1500,
  fieldMap: {
    nameCol: 0,  // 千川账户
    costCol: 4,  // 消耗
  },
};

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function findChrome() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function log(...args) {
  console.log(`[${new Date().toLocaleString()}]`, ...args);
}

async function main() {
  log('🚀 抖川自动化抓取启动');
  log('📅 目标日期:', CONFIG.date);

  const hasState = fs.existsSync(STATE_FILE);
  if (!hasState) {
    log('');
    log('⚠️ 首次使用，需要登录抖川');
    log('1. 脚本会打开 Chrome');
    log('2. 请手动登录抖川，进入【账户报表】页面');
    log('3. 登录完成后，等待 30 秒自动保存');
    log('');
  }

  let browser, context, page;

  try {
    browser = await chromium.launch({
      executablePath: CONFIG.chromePath,
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    if (hasState) {
      log('🔑 使用已保存的登录态');
      context = await browser.newContext({ storageState: STATE_FILE });
    } else {
      log('🔑 首次启动，请登录...');
      context = await browser.newContext();
    }

    page = await context.newPage();

    log('🌐 打开页面...');
    await page.goto(CONFIG.douchuanUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    if (!hasState) {
      log('⏳ 请在浏览器中完成登录（30秒后自动保存）...');
      await page.waitForTimeout(30000);
      await context.storageState({ path: STATE_FILE });
      log('✅ 登录态已保存');
    }

    // 检查是否有表格数据
    const hasTable = await page.evaluate(() => {
      return document.querySelectorAll('table tbody tr, .ant-table-tbody tr').length > 0;
    });

    if (!hasTable) {
      log('❌ 未检测到表格数据，可能未登录或页面加载失败');
      return;
    }
    log('✅ 登录状态正常，检测到表格数据');

    // 设置日期为昨天
    await setDateRange(page, CONFIG.date, CONFIG.date);

    // 抓取数据
    const records = await scrapeAllPages(page);
    log(`🎉 去重后共 ${records.length} 条记录`);

    if (records.length === 0) {
      log('⚠️ 无数据，请检查该日期是否有数据');
      return;
    }

    await pushData(records);
    log('✅ 全部完成');

  } catch (err) {
    log('❌ 错误:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

async function setDateRange(page, startDate, endDate) {
  log('📅 设置日期范围:', startDate, '~', endDate);

  // 检查当前日期
  const currentDate = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) {
      const val = inp.value || '';
      if (val.match(/\d{4}-\d{2}-\d{2}/)) return val;
    }
    return '';
  });

  if (currentDate.includes(startDate) && currentDate.includes(endDate)) {
    log('✅ 当前日期已经是目标日期');
    return;
  }

  try {
    // 抖川日期选择器：点击输入框打开面板 → 点击昨天
    // 先找到包含"开始时间"或"结束时间"附近的日期选择器
    const dateInputs = await page.locator('input[placeholder*="时间"], input[placeholder*="日期"]').all();
    if (dateInputs.length >= 2) {
      await dateInputs[0].click();
      await page.waitForTimeout(800);
    } else {
      // 备选：直接点第一个日期相关input
      await page.locator('input').nth(0).click();
      await page.waitForTimeout(800);
    }

    // 点击面板内的"昨日"
    const yesterdayBtn = page.locator('.ant-calendar-picker-container >> text=昨日').first();
    await yesterdayBtn.click();
    log('✅ 已点击昨天，等待数据刷新...');
    await page.waitForTimeout(3000);
  } catch (e) {
    log('⚠️ 自动设置日期失败:', e.message);
  }
}

async function scrapeAllPages(page) {
  const results = [];
  let pageNum = 1;

  // 获取总页数
  const pageInfo = await page.evaluate(() => {
    const pagination = document.querySelector('.ant-pagination');
    let totalMatch = null;
    if (pagination) {
      totalMatch = pagination.textContent.match(/共\s*(\d+)\s*条/);
    }
    if (!totalMatch) {
      const bodyText = document.body.innerText;
      totalMatch = bodyText.match(/共\s*(\d+)\s*条/);
    }
    const sizeMatch = document.body.innerText.match(/(\d+)\s*条\/页/);
    return {
      total: totalMatch ? parseInt(totalMatch[1]) : 0,
      pageSize: sizeMatch ? parseInt(sizeMatch[1]) : 20,
    };
  });

  const totalPages = pageInfo.total > 0 ? Math.ceil(pageInfo.total / pageInfo.pageSize) : 1;
  log(`📊 共 ${pageInfo.total} 条，${totalPages} 页`);

  // 先回到第1页
  await page.evaluate(() => {
    const pageOne = Array.from(document.querySelectorAll('.ant-pagination-item')).find(el => el.textContent.trim() === '1');
    if (pageOne) {
      const inner = pageOne.querySelector('a, button') || pageOne;
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  await page.waitForTimeout(2000);

  while (pageNum <= totalPages) {
    log(`📄 第 ${pageNum}/${totalPages} 页...`);
    await waitForTableLoad(page);

    const pageData = await page.evaluate((fieldMap) => {
      const rows = document.querySelectorAll('.ant-table-tbody tr, table tbody tr');
      const data = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll('td, .ant-table-cell');
        if (cells.length < 5) return;

        const nameEl = cells[fieldMap.nameCol];
        let name = '';
        for (const node of nameEl.childNodes) {
          if (node.nodeType === 3 && node.textContent.trim()) {
            name = node.textContent.trim();
            break;
          }
        }
        if (!name) name = nameEl.innerText.trim().split(/\s|\n/)[0];

        const costText = cells[fieldMap.costCol]?.textContent.trim().replace(/[¥,\s]/g, '') || '0';
        const cost = parseFloat(costText) || 0;

        if (name) {
          // 预处理：去掉括号及后面的内容，只保留前缀（如"次元（阿伟）"→"次元"）
          const cleanName = name.replace(/[（(].*$/, '').trim();
          data.push({ name: cleanName, cost });
        }
      });

      return data;
    }, CONFIG.fieldMap);

    log(`  ✅ ${pageData.length} 条`);
    results.push(...pageData);

    if (pageNum >= totalPages) break;

    const hasNext = await page.evaluate(() => {
      const next = document.querySelector('.ant-pagination-next');
      if (!next || next.classList.contains('ant-pagination-disabled')) return false;
      const inner = next.querySelector('a, button') || next;
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });

    if (!hasNext) break;
    pageNum++;
    await page.waitForTimeout(CONFIG.pageDelay);
  }

  const map = {};
  results.forEach(r => { map[r.name] = r; });
  return Object.values(map);
}

async function waitForTableLoad(page) {
  await page.waitForTimeout(800);
  try {
    await page.waitForFunction(() => {
      const loading = document.querySelector('.ant-spin');
      if (loading && loading.offsetParent !== null) return false;
      const rows = document.querySelectorAll('.ant-table-tbody tr, table tbody tr');
      return rows.length > 0;
    }, { timeout: 8000 });
  } catch (e) {
    // ignore
  }
}

async function pushData(records) {
  log(`📤 推送 ${records.length} 条 → ${CONFIG.apiUrl}`);
  log(`   日期: ${CONFIG.date}, 样本: ${records.slice(0, 3).map(r => r.name).join(', ')}...`);

  const res = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: CONFIG.date, costs: records }),
  });

  const json = await res.json();
  if (!json.success) {
    log('   API 返回:', JSON.stringify(json));
    throw new Error(json.error || '推送失败');
  }

  log(`✅ 推送成功：匹配 ${json.accounts} 个账号，更新 ${json.updated || 0} 条`);
}

main();
