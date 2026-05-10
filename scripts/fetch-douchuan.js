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
  pageDelay: 5000,
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

    // 关闭自动刷新（右上角倒计时刷新会导致翻页数据混乱）
    await disableAutoRefresh(page);

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

async function disableAutoRefresh(page) {
  log('🔕 尝试关闭自动刷新...');
  
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  
  // 查找页面顶部区域（y < 250）的所有开启状态的switch
  const topBarSwitches = await page.evaluate(() => {
    const results = [];
    const switches = document.querySelectorAll('.ant-switch');
    for (const sw of switches) {
      const rect = sw.getBoundingClientRect();
      const text = sw.textContent.trim();
      // 获取最近几级父元素的文本
      let parentText = '';
      let parent = sw.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        parentText += ' | ' + parent.textContent.trim().substring(0, 60);
        parent = parent.parentElement;
      }
      
      if (rect.top < 250 && sw.classList.contains('ant-switch-checked')) {
        results.push({
          text: text.substring(0, 20),
          parentText: parentText.substring(0, 120),
          y: Math.round(rect.top),
          x: Math.round(rect.left),
        });
      }
    }
    return results;
  });
  
  if (topBarSwitches.length > 0) {
    log(`  找到 ${topBarSwitches.length} 个顶部开启的 switch:`);
    topBarSwitches.forEach((s, i) => {
      log(`    [${i}] y=${s.y} x=${s.x} text="${s.text}"`);
      log(`        parent="${s.parentText}"`);
    });
  } else {
    log('  顶部区域没有找到开启的switch');
  }
  
  // 策略：优先点击 parentText 包含"倒计时"+"刷新"或"自动"+"刷新"的
  // 倒计时刷新开关的parentText特征：包含 "倒计时00:00:XX开启"
  let clicked = false;
  
  for (const info of topBarSwitches) {
    // 精确匹配：parentText 包含 "倒计时" 和 "开启"（这是倒计时刷新的特征）
    if (info.parentText.includes('倒计时') && info.parentText.includes('开启')) {
      try {
        // 使用 evaluateHandle 获取元素，然后用 Playwright 的 el.click()
        const switchEl = await page.evaluateHandle(({x, y}) => {
          const el = document.elementFromPoint(x + 5, y + 5);
          if (!el) return null;
          return el.closest('.ant-switch') || el;
        }, { x: info.x, y: info.y });
        
        if (switchEl) {
          await switchEl.click();
          await switchEl.dispose();
          log(`  ✅ 已点击「倒计时刷新」switch (y=${info.y})`);
          clicked = true;
          await page.waitForTimeout(2000);
          
          // 验证：检查switch是否变成了关闭状态
          const isStillOn = await page.evaluate(({x, y}) => {
            const el = document.elementFromPoint(x + 5, y + 5);
            if (!el) return true;
            const sw = el.closest('.ant-switch') || el;
            return sw.classList.contains('ant-switch-checked');
          }, { x: info.x, y: info.y });
          
          if (!isStillOn) {
            log('  ✅ 验证通过：倒计时刷新已关闭');
          } else {
            log('  ⚠️ 验证失败：switch 仍处于开启状态');
          }
          break;
        }
      } catch (e) { 
        log('  ⚠️ 点击失败:', e.message);
      }
    }
  }
  
  if (!clicked) {
    log('  ⚠️ 未找到可关闭的自动刷新开关');
  }

  // 清除所有定时器
  await page.evaluate(() => {
    const maxId = setInterval(() => {}, 9999);
    for (let i = 1; i <= maxId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    clearInterval(maxId);
  });
  
  log('  ✅ 已清除所有定时器');
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
  return scrapeViaDom(page);
}

async function scrapeViaDom(page) {
  const results = [];
  const seenNames = new Set();
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

  // 尝试把每页显示条数改为100（避免翻页问题）
  const pageSizeChanged = await page.evaluate(() => {
    // 找 "条/页" 下拉框
    const selects = document.querySelectorAll('.ant-pagination-options-size-changer, .ant-select');
    for (const sel of selects) {
      const text = sel.textContent;
      if (text.includes('条') || text.includes('页')) {
        // 点击打开下拉
        sel.click();
        return true;
      }
    }
    return false;
  });
  
  if (pageSizeChanged) {
    await page.waitForTimeout(800);
    // 选择 100条/页
    const option100 = await page.locator('.ant-select-dropdown-menu-item:has-text("100")').first();
    if (option100) {
      try {
        await option100.click();
        log('✅ 已切换为 100条/页');
        await page.waitForTimeout(3000);
        // 重新获取页数
        const newPageInfo = await page.evaluate(() => {
          const pagination = document.querySelector('.ant-pagination');
          const totalMatch = pagination?.textContent.match(/共\s*(\d+)\s*条/);
          return {
            total: totalMatch ? parseInt(totalMatch[1]) : 0,
            pageSize: 100,
          };
        });
        if (newPageInfo.total > 0) {
          pageInfo.total = newPageInfo.total;
          pageInfo.pageSize = newPageInfo.pageSize;
        }
      } catch (e) {
        log('⚠️ 切换分页大小失败:', e.message);
      }
    }
  }

  const newTotalPages = pageInfo.total > 0 ? Math.ceil(pageInfo.total / pageInfo.pageSize) : 1;
  if (newTotalPages === 1) {
    log('📄 只需抓取 1 页（100条/页）');
  }

  // 先回到第1页
  await page.evaluate(() => {
    const pageOne = Array.from(document.querySelectorAll('.ant-pagination-item')).find(el => el.textContent.trim() === '1');
    if (pageOne) {
      const inner = pageOne.querySelector('a, button') || pageOne;
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  await page.waitForTimeout(2000);

  while (pageNum <= newTotalPages) {
    log(`📄 第 ${pageNum}/${newTotalPages} 页...`);
    const expectRowCount = (pageNum === newTotalPages) ? (pageInfo.total % pageInfo.pageSize || pageInfo.pageSize) : pageInfo.pageSize;
    await waitForTableLoad(page, expectRowCount);

    // Verify current page number from pagination
    const currentPageNum = await page.evaluate(() => {
      const active = document.querySelector('.ant-pagination-item-active');
      return active ? parseInt(active.textContent || '0') : 0;
    });
    if (currentPageNum !== pageNum) {
      log(`  ⚠️ 页码不匹配: 期望 ${pageNum}, 实际 ${currentPageNum}, 等待重试...`);
      await page.waitForTimeout(3000);
    }

    // 等待表格内容稳定（连续两次抓取结果一致）
    let pageData = [];
    let stableAttempts = 0;
    const maxStableAttempts = 8;
    let lastSnapshot = '';
    
    while (stableAttempts < maxStableAttempts) {
      const currentData = await page.evaluate((fieldMap) => {
        const rows = document.querySelectorAll('.ant-table-tbody tr, table tbody tr');
        const data = [];

        rows.forEach(row => {
          // 只抓取可见的行（跳过被隐藏的旧页面数据）
          const style = window.getComputedStyle(row);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          
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
            const cleanName = name.replace(/[（(].*$/, '').trim();
            data.push({ name: cleanName, cost });
          }
        });

        return data;
      }, CONFIG.fieldMap);
      
      const snapshot = JSON.stringify(currentData.map(r => r.name));
      if (snapshot === lastSnapshot && currentData.length > 0) {
        pageData = currentData;
        if (stableAttempts > 0) {
          log(`  ⏳ 表格稳定，等待了 ${stableAttempts + 1} 次`);
        }
        break;
      }
      lastSnapshot = snapshot;
      stableAttempts++;
      if (stableAttempts < maxStableAttempts) {
        await page.waitForTimeout(600);
      }
    }
    
    if (stableAttempts >= maxStableAttempts) {
      log(`  ⚠️ 表格未稳定，使用最后一次抓取数据`);
    }

    // 过滤掉之前页面已经出现过的账号（DOM残留的旧数据）
    const newData = pageData.filter(r => !seenNames.has(r.name));
    const filteredCount = pageData.length - newData.length;
    if (filteredCount > 0) {
      log(`  🧹 过滤 ${filteredCount} 条残留数据: ${pageData.filter(r => seenNames.has(r.name)).map(r => r.name).join(', ')}`);
    }
    log(`  ✅ ${newData.length} 条新数据: ${newData.map(r => r.name).join(', ')}`);
    results.push(...newData);
    newData.forEach(r => seenNames.add(r.name));

    if (pageNum >= totalPages) break;

    const nextBtn = await page.$('.ant-pagination-next:not(.ant-pagination-disabled)');
    if (!nextBtn) break;

    const beforeName = await page.evaluate(() => {
      const firstRow = document.querySelector('.ant-table-tbody tr, table tbody tr');
      return firstRow ? firstRow.textContent.trim().substring(0, 20) : '';
    });

    await nextBtn.click();
    pageNum++;
    await page.waitForTimeout(CONFIG.pageDelay);
    await waitForTableLoad(page);

    const afterName = await page.evaluate(() => {
      const firstRow = document.querySelector('.ant-table-tbody tr, table tbody tr');
      return firstRow ? firstRow.textContent.trim().substring(0, 20) : '';
    });

    if (beforeName === afterName) {
      log(`  ⚠️ 翻页未生效，数据未变化（${beforeName}）`);
      await page.waitForTimeout(3000);
      await waitForTableLoad(page);
    }
    
  }

  // Merge costs by cleaned name
  const merged = {};
  for (const r of results) {
    if (merged[r.name]) {
      merged[r.name].cost += r.cost;
    } else {
      merged[r.name] = { ...r };
    }
  }
  return Object.values(merged);
}

async function waitForTableLoad(page, expectRows) {
  await page.waitForTimeout(1000);
  try {
    await page.waitForFunction((expect) => {
      const loading = document.querySelector('.ant-spin');
      if (loading && loading.offsetParent !== null) return false;
      const rows = document.querySelectorAll('.ant-table-tbody tr, table tbody tr');
      return rows.length >= expect;
    }, expectRows || 1, { timeout: 10000 });
  } catch (e) {
    // ignore
  }
}

async function pushData(records) {
  log(`📤 推送 ${records.length} 条 → ${CONFIG.apiUrl}`);
  log(`   日期: ${CONFIG.date}, 样本: ${records.slice(0, 3).map(r => r.name).join(', ')}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const res = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: CONFIG.date, costs: records }),
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

main();
