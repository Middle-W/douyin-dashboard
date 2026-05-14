/**
 * 抖老板小时级采集脚本 - 当天数据 (Playwright)
 * 页面: https://www.doulaoban.com/douyin/order-manage/promote-data
 *
 * 用途: 每半小时采集一次当天实时数据
 * 定时: Windows 计划任务 每小时的 05 分运行
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================
const STATE_FILE = path.join(__dirname, '.storage-state.json');

const CONFIG = {
  // 抖老板账号排行页面
  doubossUrl: 'https://www.doulaoban.com/douyin/order-manage/promote-data',

  // 推送 API
  apiUrl: process.env.API_URL || 'http://localhost:3000/api/import-daily-stats',

  // 抓取日期（默认今天）
  date: process.env.FETCH_DATE || getToday(),

  // Chrome 路径（自动检测）
  chromePath: process.env.CHROME_PATH || findChrome(),

  // 无头模式（定时任务建议 true）
  headless: process.env.HEADLESS === 'true',

  // 翻页延迟
  pageDelay: 800,

  // 字段映射（根据截图列顺序调整）
  // 列: 0排名 1账号 2授权状态 3全部销售额 4全部单数 5全部佣金 6有效单数 7有效佣金 8有效净佣金 9退款单数...
  fieldMap: {
    nameCol: 1,      // 账号名所在列
    ordersCol: 6,    // 单量（有效单数）
    netIncomeCol: 8, // 净佣金（有效净佣金）
  },
};

function getToday() {
  const d = new Date();
  // 用本地时间，避免 UTC 时区偏差
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

// ==================== 主流程 ====================
async function main() {
  log('🚀 抖老板自动化抓取启动');
  log('📅 目标日期:', CONFIG.date);
  log('🔗 页面:', CONFIG.doubossUrl);

  const hasState = fs.existsSync(STATE_FILE);

  if (!hasState) {
    log('');
    log('⚠️ 首次使用，需要登录抖老板');
    log('1. 脚本会打开 Chrome');
    log('2. 请手动登录抖老板，并进入【账号排行】页面');
    log('3. 登录完成后，回到终端按任意键继续');
    log('4. 登录态会自动保存');
    log('');
  }

  let browser, context, page;

  try {
    browser = await chromium.launch({
      executablePath: CONFIG.chromePath,
      headless: CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // 如果有保存的登录态，直接恢复
    if (hasState) {
      log('🔑 使用已保存的登录态');
      context = await browser.newContext({ storageState: STATE_FILE });
    } else {
      log('🔑 首次启动，请登录...');
      context = await browser.newContext();
    }

    page = await context.newPage();

    // 打开页面
    log('🌐 打开页面...');
    await page.goto(CONFIG.doubossUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 首次运行：等待用户手动登录
    if (!hasState) {
      log('⏳ 请在浏览器中完成登录（30秒后自动保存）...');
      await page.waitForTimeout(30000);

      // 保存登录态
      await context.storageState({ path: STATE_FILE });
      log('✅ 登录态已保存');
    }

    // 检查登录状态
    const isLoggedIn = await page.evaluate(() => {
      return document.querySelectorAll('table tbody tr, .arco-table tbody tr').length > 0;
    });

    if (!isLoggedIn) {
      log('❌ 未检测到表格数据，可能未登录或页面加载失败');
      return;
    }
    log('✅ 登录状态正常，检测到表格数据');

    // 设置日期
    await setDateRange(page, CONFIG.date, CONFIG.date);

    // 抓取数据
    const records = await scrapeAllPages(page);
    log(`🎉 去重后共 ${records.length} 条记录`);

    if (records.length === 0) {
      log('⚠️ 无数据，请检查该日期是否有数据');
      return;
    }

    // 推送
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

// ==================== 页面操作 ====================

async function setDateRange(page, startDate, endDate) {
  log('📅 设置日期范围:', startDate, '~', endDate);

  // 先检查当前日期是否已经是目标日期
  const currentDate = await page.evaluate(() => {
    const echo = document.querySelector('.date-range-picker-select-date-echo');
    if (echo) {
      const inputs = echo.querySelectorAll('input');
      if (inputs.length >= 2) return `${inputs[0].value} ~ ${inputs[1].value}`;
    }
    return '';
  });

  const currentDateStr = currentDate.replace(/ 00:00:00/g, '').replace(/ 23:59:59/g, '');
  if (currentDateStr.includes(startDate) && currentDateStr.includes(endDate)) {
    log('✅ 当前日期已经是目标日期，无需修改');
    return;
  }

  try {
    // 1. 点击日期选择器打开面板
    const dateEcho = page.locator('.date-range-picker-select-date-echo').first();
    await dateEcho.click();
    await page.waitForTimeout(1000);

    // 2. 精确点击面板内 .arco-picker-shortcuts 中的"今天"按钮
    const todayBtn = page.locator('.arco-picker-shortcuts >> text=今天').first();
    await todayBtn.click();
    log('✅ 已点击今天，等待数据刷新...');
    await page.waitForTimeout(3000);
  } catch (e) {
    log('⚠️ 自动设置日期失败:', e.message);
    log('   请手动确认日期是否为:', startDate);
  }
}

async function switchToAccountRanking(page) {
  // 检查当前是否在账号排行
  const isAccountRanking = await page.evaluate(() => {
    const title = document.title;
    return title.includes('账号排行');
  });

  if (!isAccountRanking) {
    log('🔄 切回账号排行...');
    try {
      // 点击左侧菜单的账号排行（在 .menu-wrapper 或 .arco-layout-sider 内）
      const menu = page.locator('.menu-wrapper, .arco-layout-sider').locator('text=账号排行').first();
      await menu.click();
      await page.waitForTimeout(2500);
      log('✅ 已切换到账号排行');
    } catch (e) {
      log('⚠️ 切换失败:', e.message);
    }
  }
}

async function scrapeAllPages(page) {
  // 先验证当前页面是否是账号排行（不是商品排行）
  const firstRowName = await page.evaluate(() => {
    const rows = document.querySelectorAll('.arco-table tbody tr, table tbody tr');
    if (rows.length === 0) return '';
    const cells = rows[0].querySelectorAll('td, .arco-table-td');
    if (cells.length < 3) return '';
    // 账号名通常在 cells[1]，取纯文本
    for (const node of cells[1].childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) return node.textContent.trim();
    }
    return cells[1].innerText.trim().split(/\s|\n/)[0];
  });

  if (!firstRowName || firstRowName.length > 20) {
    log('❌ 当前页面似乎不是账号排行，第一行数据:', firstRowName?.substring(0, 30));
    log('   请确认页面在【账号排行】标签后再运行脚本');
    return [];
  }
  log('✅ 数据校验通过，第一行账号:', firstRowName);
  const results = [];
  let pageNum = 1;

  // 获取总页数（从分页器精确获取，避免 body.innerText 污染）
  const pageInfo = await page.evaluate(() => {
    // 找分页器区域内的"共 X 条"
    const pagination = document.querySelector('.arco-pagination');
    let totalMatch = null;
    if (pagination) {
      totalMatch = pagination.textContent.match(/共\s*(\d+)\s*条/);
    }
    // 备选：从表格附近的文本找
    if (!totalMatch) {
      const tableArea = document.querySelector('.arco-table, table');
      if (tableArea) {
        const parent = tableArea.closest('div') || tableArea.parentElement;
        totalMatch = parent.textContent.match(/共\s*(\d+)\s*条/);
      }
    }
    const sizeMatch = document.body.innerText.match(/(\d+)\s*条\/页/);
    return {
      total: totalMatch ? parseInt(totalMatch[1]) : 0,
      pageSize: sizeMatch ? parseInt(sizeMatch[1]) : 10,
    };
  });

  let totalPages = pageInfo.total > 0 ? Math.ceil(pageInfo.total / pageInfo.pageSize) : 1;
  log(`📊 共 ${pageInfo.total} 条，${totalPages} 页`);

  // 先回到第1页
  await page.evaluate(() => {
    const pageOne = Array.from(document.querySelectorAll('.arco-pagination-item'))
      .find(el => el.textContent.trim() === '1');
    if (pageOne) {
      const inner = pageOne.querySelector('a, button, span') || pageOne;
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  await page.waitForTimeout(2000);

  // 尝试切换为 100 条/页
  const pageSizeChanged = await page.evaluate(() => {
    const sizeChanger = document.querySelector('.arco-pagination-size-changer, .arco-select');
    if (!sizeChanger) return false;
    sizeChanger.click();
    return true;
  });

  if (pageSizeChanged) {
    await page.waitForTimeout(800);
    const selected100 = await page.evaluate(() => {
      const options = document.querySelectorAll('.arco-select-option, .arco-dropdown-menu-item, .arco-list-item');
      for (const opt of options) {
        if (opt.textContent.includes('100')) {
          opt.click();
          return true;
        }
      }
      return false;
    });
    if (selected100) {
      await page.waitForTimeout(2500);
      log('✅ 已切换为 100条/页');
      // 重新获取分页信息
      const newPageInfo = await page.evaluate(() => {
        const pagination = document.querySelector('.arco-pagination');
        let totalMatch = null;
        if (pagination) totalMatch = pagination.textContent.match(/共\s*(\d+)\s*条/);
        if (!totalMatch) {
          const tableArea = document.querySelector('.arco-table, table');
          if (tableArea) {
            const parent = tableArea.closest('div') || tableArea.parentElement;
            totalMatch = parent.textContent.match(/共\s*(\d+)\s*条/);
          }
        }
        const sizeMatch = document.body.innerText.match(/(\d+)\s*条\/页/);
        return {
          total: totalMatch ? parseInt(totalMatch[1]) : 0,
          pageSize: sizeMatch ? parseInt(sizeMatch[1]) : 10,
        };
      });
      pageInfo.total = newPageInfo.total;
      pageInfo.pageSize = newPageInfo.pageSize;
      totalPages = pageInfo.total > 0 ? Math.ceil(pageInfo.total / pageInfo.pageSize) : 1;
      log(`📊 更新后：共 ${pageInfo.total} 条，${totalPages} 页`);
    }
  }

  while (pageNum <= totalPages) {
    log(`📄 第 ${pageNum}/${totalPages} 页...`);

    await waitForTableLoad(page);

    const pageData = await page.evaluate((fieldMap) => {
      const rows = document.querySelectorAll('table tbody tr, .arco-table tbody tr');
      const data = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll('td, .arco-table-td');
        if (cells.length < 6) return;

        // 提取账号名（cells[1] 包含头像+名称+UID+粉丝数+运营人）
        const nameEl = cells[fieldMap.nameCol];
        let name = '';

        // 优先取纯文本节点（过滤子元素如头像、标签）
        for (const node of nameEl.childNodes) {
          if (node.nodeType === 3 && node.textContent.trim()) {
            name = node.textContent.trim();
            break;
          }
        }
        // 备选：innerText 第一行
        if (!name) {
          name = nameEl.innerText.trim().split(/\s|\n/)[0];
        }

        const ordersText = cells[fieldMap.ordersCol]?.textContent.trim().replace(/,/g, '') || '0';
        const netIncomeText = cells[fieldMap.netIncomeCol]?.textContent.trim().replace(/[¥,\s]/g, '') || '0';

        const orders = parseInt(ordersText) || 0;
        const netIncome = parseFloat(netIncomeText) || 0;

        if (name) {
          data.push({ name, orders, net_income: netIncome });
        }
      });

      return data;
    }, CONFIG.fieldMap);

    log(`  ✅ ${pageData.length} 条`);
    results.push(...pageData);

    if (pageNum >= totalPages) break;

    // 翻页
    const hasNext = await page.evaluate(() => {
      const next = document.querySelector('.arco-pagination-item-next');
      if (!next || next.classList.contains('arco-pagination-item-disabled')) return false;
      const inner = next.querySelector('a, button, span') || next;
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });

    if (!hasNext) break;
    pageNum++;
    await page.waitForTimeout(CONFIG.pageDelay);
  }

  // 去重（同名取最后出现的）
  const map = {};
  results.forEach(r => { map[r.name] = r; });
  return Object.values(map);
}

async function waitForTableLoad(page) {
  // 抖老板翻页后 loading 很快消失，不需要等太久
  // 策略：先等一小段时间让数据刷新，再检测行数是否稳定
  await page.waitForTimeout(600);

  try {
    await page.waitForFunction(() => {
      const loading = document.querySelector('.arco-table-loading');
      if (loading && loading.offsetParent !== null) return false;
      const rows = document.querySelectorAll('.arco-table tbody tr, table tbody tr');
      return rows.length > 0;
    }, { timeout: 5000 });
  } catch (e) {
    // 超时也不阻塞，继续执行
  }
}

// ==================== 推送 ====================

async function pushData(records) {
  log(`📤 推送 ${records.length} 条 → ${CONFIG.apiUrl}`);
  log(`   日期: ${CONFIG.date}, 样本: ${records.slice(0, 3).map(r => r.name).join(', ')}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const res = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: CONFIG.date, stats: records }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  const json = await res.json();
  if (!json.success) {
    log('   API 返回:', JSON.stringify(json));
    throw new Error(json.error || '推送失败');
  }

  log(`✅ 推送成功：匹配 ${json.accounts} 个账号，更新 ${json.updated || 0} 条`);
}

// ==================== 入口 ====================
main();
