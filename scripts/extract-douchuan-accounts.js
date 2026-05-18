const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COMPANY_STATE = path.join(__dirname, '.douchuan-state-company.json');

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function log(...args) {
  console.log(`[${new Date().toLocaleString()}]`, ...args);
}

async function extractPageData(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText;
    const data = [];
    const seen = new Set();
    const pattern = /([^\n]{2,40})\n\s*户ID[：:\s]*(\d{10,})\s*\n\s*查看账户关联计划/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[1].trim().replace(/\s+/g, ' ');
      const accountId = match[2];
      if (name && accountId && !seen.has(accountId)) {
        seen.add(accountId);
        data.push({ name, accountId: String(accountId) });
      }
    }
    return data;
  });
}

async function getTotalPages(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/共(\d+)条/);
    return match ? parseInt(match[1]) : 0;
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    args: ['--window-size=1280,900'],
  });

  const context = await browser.newContext({ storageState: COMPANY_STATE });
  const page = await context.newPage();

  const targetDate = getYesterday();
  log('打开抖川账户报表，目标日期:', targetDate);

  await page.goto('https://dy.douchuanec.com/#/qy_balance', { waitUntil: 'domcontentloaded', timeout: 120000 });
  log('⏳ 等待页面基础加载...');
  await page.waitForTimeout(10000);

  // 设置日期为昨天
  log('📅 设置日期为昨天...');
  try {
    const dateInputs = await page.locator('input[placeholder*="时间"], input[placeholder*="日期"]').all();
    if (dateInputs.length >= 2) {
      await dateInputs[0].click();
      await page.waitForTimeout(800);
    }
    const yesterdayBtn = page.locator('.ant-calendar-picker-container >> text=昨日').first();
    await yesterdayBtn.click();
    log('✅ 已点击昨天');
  } catch (e) {
    log('⚠️ 设置日期失败:', e.message);
  }
  await page.waitForTimeout(3000);

  // 关闭右上角自动刷新
  log('🔕 关闭自动刷新...');
  try {
    // 找到倒计时刷新开关并点击关闭
    const refreshSwitches = await page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent?.trim() || '';
        if (text.includes('倒计时') && text.includes('开启')) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 250) {
            results.push({ x: rect.left + 5, y: rect.top + 5 });
          }
        }
      }
      return results;
    });
    
    if (refreshSwitches.length > 0) {
      for (const pos of refreshSwitches) {
        const switchEl = await page.evaluateHandle(({x, y}) => {
          return document.elementFromPoint(x, y);
        }, pos);
        if (switchEl) {
          await switchEl.click();
          await switchEl.dispose();
          log('  ✅ 已点击刷新开关');
        }
      }
    }
    
    // 清除定时器
    await page.evaluate(() => {
      const maxId = setInterval(() => {}, 9999);
      for (let i = 1; i <= maxId; i++) { clearInterval(i); clearTimeout(i); }
      clearInterval(maxId);
    });
    log('  ✅ 已清除定时器');
  } catch (e) {
    log('⚠️ 关闭刷新失败:', e.message);
  }

  // 切换为100条/页
  log('📄 切换为100条/页...');
  try {
    // 先找"条/页"文本附近的select元素
    const pageSizeFound = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent?.trim() || '';
        if (text.includes('条/页') || text.includes('条 / 页')) {
          // 向上找最近的select或dropdown
          let parent = el.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const select = parent.querySelector('select, .ant-select, .ant-pagination-options-size-changer');
            if (select) {
              select.click();
              return true;
            }
            parent = parent.parentElement;
          }
          // 直接点这个元素
          el.click();
          return true;
        }
      }
      return false;
    });
    
    if (pageSizeFound) {
      await page.waitForTimeout(500);
      // 选择100条
      const optionClicked = await page.evaluate(() => {
        const options = document.querySelectorAll('.ant-select-dropdown-menu-item, .ant-select-item, [class*="option"]');
        for (const opt of options) {
          if (opt.textContent?.includes('100')) {
            opt.click();
            return true;
          }
        }
        // 备选：直接找包含"100"的元素
        const all = document.querySelectorAll('*');
        for (const el of all) {
          if (el.textContent?.trim() === '100') {
            el.click();
            return true;
          }
        }
        return false;
      });
      
      if (optionClicked) {
        log('✅ 已切换100条/页');
        await page.waitForTimeout(5000);
      } else {
        log('⚠️ 未找到100条选项');
      }
    } else {
      log('⚠️ 未找到分页控件');
    }
  } catch (e) {
    log('⚠️ 切换分页失败:', e.message);
  }

  // 等待数据加载
  log('⏳ 等待数据加载（930条）...');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(4000);
    const hasData = await page.evaluate(() => document.body.innerText.includes('户ID'));
    if (hasData) {
      log(`✅ 数据已加载（${(i+1)*4}s）`);
      break;
    }
    log(`  还在加载... ${(i+1)*4}s`);
  }
  await page.waitForTimeout(5000);

  // 获取总条数
  const totalCount = await getTotalPages(page);
  log(`📊 总条数: ${totalCount}`);

  // 翻页提取所有数据
  log('🔍 开始翻页提取...');
  const allAccounts = [];
  const seen = new Set();
  let pageNum = 1;
  let hasNext = true;

  while (hasNext) {
    log(`  提取第 ${pageNum} 页...`);
    const pageData = await extractPageData(page);
    log(`    本页提取到 ${pageData.length} 条`);
    
    for (const item of pageData) {
      if (!seen.has(item.accountId)) {
        seen.add(item.accountId);
        allAccounts.push(item);
      }
    }

    // 点击下一页
    hasNext = await page.evaluate(() => {
      const nextBtn = document.querySelector('.ant-pagination-next, [class*="pagination-next"]');
      if (nextBtn && !nextBtn.classList.contains('ant-pagination-disabled')) {
        nextBtn.click();
        return true;
      }
      return false;
    });

    if (hasNext) {
      pageNum++;
      log('  等待下一页加载...');
      await page.waitForTimeout(5000);
    }
  }

  log(`✅ 总共提取到 ${allAccounts.length} 条数据`);
  allAccounts.slice(0, 10).forEach((a, i) => log(`  ${i+1}. ${a.name} | 户ID: ${a.accountId}`));
  if (allAccounts.length > 10) log(`  ... 共 ${allAccounts.length} 条`);

  // 保存JSON
  fs.writeFileSync('douchuan-accounts.json', JSON.stringify(allAccounts, null, 2));
  log('JSON已保存');

  // 生成Excel（户ID文本格式）
  try {
    const XLSX = require('xlsx');
    const ws_data = [['账号名称', '户ID（文本格式）']];
    allAccounts.forEach(a => ws_data.push([a.name, a.accountId]));
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '抖川户ID');
    ws['!cols'] = [{wch: 20}, {wch: 25}];
    XLSX.writeFile(wb, 'douchuan-accounts.xlsx');
    log('Excel已保存（户ID为文本格式）');
  } catch (e) {
    log('⚠️ Excel生成失败:', e.message);
  }

  log('按回车键关闭浏览器...');
  process.stdin.once('data', async () => {
    await browser.close();
    process.exit(0);
  });
})();
