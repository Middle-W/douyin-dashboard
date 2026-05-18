/**
 * 抖老板订单明细导出-下载-解析自动化脚本
 * 流程: 登录 → 切到订单明细 → 设置日期 → 点击导出 → 确认对话框 → 轮询导出记录 → 点击下载 → 解析入库
 *
 * 安装: cd scripts && npm install xlsx
 * 运行: node fetch-douboss-export.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// ==================== 配置 ====================
const STATE_FILE = path.join(__dirname, '.storage-state.json');
const DOWNLOAD_DIR = path.join(__dirname, '.downloads');

const CONFIG = {
  // 抖老板订单明细页面（直达链接，无需切换菜单）
  doubossUrl: 'https://www.doulaoban.com/douyin/order-manage/order-list',

  // 推送 API（订单明细聚合后推送）
  apiUrl: process.env.API_URL || 'http://localhost:3000/api/import-daily-stats',

  // 目标日期范围（默认最近7天）
  startDate: process.env.FETCH_START || getLast7Days().startDate,
  endDate: process.env.FETCH_END || getLast7Days().endDate,

  chromePath: process.env.CHROME_PATH || findChrome(),
  headless: process.env.HEADLESS !== 'false',  // 默认静默运行（无头模式），除非显式设置 HEADLESS=false

  // 轮询导出完成的间隔和超时
  pollInterval: 3000,
  pollTimeout: 180000, // 3分钟（7天数据导出可能更久）

  // 解析后是否保留 Excel
  keepExcel: process.env.KEEP_EXCEL === 'true',
  // 每步操作后暂停(ms)，方便观察（0 表示不暂停）
  pauseMs: parseInt(process.env.PAUSE_MS || '0', 10),
};

function getLast7Days() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() - 1); // 昨天（不含今天）
  
  const start = new Date(today);
  start.setDate(today.getDate() - 7); // 7天前
  
  const fmt = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return { startDate: fmt(start), endDate: fmt(end) };
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
  log('🚀 抖老板订单明细导出自动化启动');
  log('📅 目标日期范围:', CONFIG.startDate, '~', CONFIG.endDate);

  if (!fs.existsSync(STATE_FILE)) {
    log('');
    log('⚠️ 首次使用，需要登录抖老板');
    log('1. 脚本会打开 Chrome');
    log('2. 请手动登录抖老板，并进入【订单明细】页面');
    log('3. 登录完成后，按 Ctrl+C 结束脚本');
    log('4. 下次运行将自动使用登录态');
    log('');
  }

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  let browser, context, page;

  try {
    browser = await chromium.launch({
      executablePath: CONFIG.chromePath,
      headless: CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    context = await browser.newContext({
      storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
      acceptDownloads: true,
    });

    page = await context.newPage();

    // 首次运行：打开页面让用户登录
    if (!fs.existsSync(STATE_FILE)) {
      log('🌐 打开页面，请登录...');
      await page.goto(CONFIG.doubossUrl, { waitUntil: 'networkidle', timeout: 60000 });
      log('⏳ 登录完成后请按 Ctrl+C 结束，然后重新运行');
      await new Promise(() => {}); // 永久等待
    }

    log('🌐 打开订单明细页面...');
    await page.goto(CONFIG.doubossUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 切换到"订单明细"标签
    await switchToOrderDetailTab(page);
    if (CONFIG.pauseMs > 0) await page.waitForTimeout(CONFIG.pauseMs);

    // 设置日期范围（最近7天）
    await setDateRange(page, CONFIG.startDate, CONFIG.endDate);
    if (CONFIG.pauseMs > 0) await page.waitForTimeout(CONFIG.pauseMs);

    // 点击导出 → 确认 → 轮询 → 下载
    const excelPath = await exportAndDownload(page);
    if (!excelPath) {
      log('❌ 下载失败');
      return;
    }

    // 解析 Excel（订单明细格式）
    const records = await parseOrderExcel(excelPath);
    log(`📊 解析完成: ${records.length} 条记录`);

    if (records.length === 0) {
      log('⚠️ Excel 中无有效数据');
      return;
    }

    // 推送入库
    await pushData(records);
    log('✅ 全部完成');

    // 清理
    if (!CONFIG.keepExcel) {
      fs.unlinkSync(excelPath);
      log('🗑️ 已清理临时文件');
    } else {
      log(`💾 Excel 已保留: ${excelPath}`);
    }

  } catch (err) {
    log('❌ 错误:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

// ==================== 页面操作 ====================

async function takeScreenshot(page, name) {
  const screenshotPath = path.join(DOWNLOAD_DIR, `screenshot-${name}-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  log(`   📸 截图已保存: ${screenshotPath}`);
}

async function switchToOrderDetailTab(page) {
  log('🔄 切换到【订单明细】...');

  try {
    // 策略1: 精确找左侧菜单中文字恰好是"订单明细"的 <a> 标签
    const clicked = await page.evaluate(() => {
      const sider = document.querySelector('.arco-layout-sider, .menu-wrapper, .sidebar, aside, nav');
      if (!sider) return { clicked: false, reason: 'no-sider' };

      // 只找 <a> 标签，精确匹配文字内容
      const links = sider.querySelectorAll('a');
      for (const el of links) {
        const text = (el.textContent || '').trim().replace(/\s+/g, '');
        if (text === '订单明细') {
          el.click();
          return { clicked: true, method: 'a-tag-exact' };
        }
      }

      // 备选：找 li 或 div 内的菜单项，通过子 <a> 点击
      const items = sider.querySelectorAll('li, .menu-item, .arco-menu-item, [class*="menu-item"]');
      for (const item of items) {
        const directText = Array.from(item.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent.trim())
          .join('')
          .replace(/\s+/g, '');
        if (directText === '订单明细' || item.textContent.trim().replace(/\s+/g, '') === '订单明细') {
          const a = item.querySelector('a');
          if (a) { a.click(); return { clicked: true, method: 'menu-item-a' }; }
          item.click();
          return { clicked: true, method: 'menu-item-click' };
        }
      }

      return { clicked: false, reason: 'not-found' };
    });

    if (clicked.clicked) {
      await page.waitForTimeout(3000);
      log(`✅ 已点击菜单 (method: ${clicked.method})`);
    } else {
      log(`⚠️ 自动切换失败: ${clicked.reason}`);
    }

    // 验证是否真的切换成功
    const isOrderDetail = await page.evaluate(() => {
      const headers = document.querySelectorAll('table th, .arco-table-th, .table-header-cell');
      for (const h of headers) {
        const text = h.textContent || '';
        if (text.includes('达人信息') || text.includes('商品信息') || text.includes('订单状态')) return true;
      }
      const hasExportBtn = document.querySelector('.left-btn, [class*="export"]');
      const bodyText = document.body.innerText;
      return bodyText.includes('数据列表') && bodyText.includes('导出') && hasExportBtn;
    });

    if (isOrderDetail) {
      log('✅ 验证通过：当前是订单明细页面');
      await takeScreenshot(page, 'after-switch-tab');
      return;
    }

    log('⚠️ 验证失败：当前页面不是订单明细');
    await takeScreenshot(page, 'switch-tab-failed');

    // 兜底：暂停等待用户手动切换
    if (!CONFIG.headless) {
      log('');
      log('⏸️ 请在浏览器中手动点击左侧菜单的【订单明细】');
      log('   切换完成后，回到终端按回车继续...');
      log('');
      await waitForEnter();
      log('▶️ 继续执行');
    }
  } catch (e) {
    log('⚠️ 切换标签失败:', e.message);
    await takeScreenshot(page, 'switch-tab-error');
  }
}

async function waitForEnter() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('', () => { rl.close(); resolve(); });
  });
}

async function setDateRange(page, startDate, endDate) {
  log('📅 设置日期范围:', startDate, '~', endDate);

  try {
    // 点击日期选择器打开面板
    await page.evaluate(() => {
      const echo = document.querySelector('.date-range-picker-select-date-echo, .arco-picker');
      if (echo) echo.click();
    });
    await page.waitForTimeout(1200);

    // 策略1: 用 JS 直接点击"最近7天"（绕过 Playwright 选择器问题）
    const clickedQuick7 = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = (el.textContent || '').trim().replace(/\s+/g, '');
        if (text === '最近7天' && el.offsetParent !== null) {
          el.click();
          return { clicked: true, tag: el.tagName, class: el.className };
        }
      }
      return { clicked: false };
    });

    if (clickedQuick7.clicked) {
      log(`   ✅ 已点击"最近7天" (${clickedQuick7.tag}.${clickedQuick7.class})`);
    } else {
      log('   未找到"最近7天"，尝试手动输入日期...');
    }

    await page.waitForTimeout(600);

    // 点击"确定"按钮（同样用 JS，绕过 visibility 检查）
    const clickedConfirm = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, .arco-btn');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim().replace(/\s+/g, '');
        if ((text === '确定' || text === '确认') && btn.offsetParent !== null) {
          btn.click();
          return { clicked: true, text, class: btn.className };
        }
      }
      return { clicked: false };
    });

    if (clickedConfirm.clicked) {
      log(`   ✅ 已点击"${clickedConfirm.text}"`);
    } else {
      log('   ⚠️ 未找到确定按钮');
    }

    await page.waitForTimeout(2500);

    // 验证日期是否正确设置
    const afterDate = await page.evaluate(() => {
      const echo = document.querySelector('.date-range-picker-select-date-echo');
      if (echo) {
        const text = echo.textContent || '';
        const match = text.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
        if (match) return `${match[1]} ~ ${match[2]}`;
        return text;
      }
      const inputs = document.querySelectorAll('.arco-picker-input input');
      if (inputs.length >= 2) return `${inputs[0].value} ~ ${inputs[1].value}`;
      return '';
    });
    log('   设置后日期:', afterDate || '(未读取到)');

    // 如果还是单日期（没改成功），手动输入
    if (afterDate && !afterDate.includes('~') && !afterDate.includes('-') && !afterDate.includes('至')) {
      log('   ⚠️ 日期未生效，手动输入...');
      await page.evaluate((s, e) => {
        const inputs = document.querySelectorAll('.arco-picker-input input, .arco-picker input');
        if (inputs.length >= 2) {
          inputs[0].value = s + ' 00:00:00';
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[1].value = e + ' 23:59:59';
          inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
        // 找确定按钮点击
        const btns = document.querySelectorAll('button, .arco-btn');
        for (const btn of btns) {
          const t = (btn.textContent || '').trim();
          if (t === '确定' || t === '确认') { btn.click(); break; }
        }
      }, startDate, endDate);
      await page.waitForTimeout(2000);
      log('   ✅ 已手动输入日期');
    }

    log('✅ 日期设置完成');
  } catch (e) {
    log('⚠️ 自动设置日期失败:', e.message);
  }
}

async function exportAndDownload(page) {
  log('📥 开始导出流程...');

  // 1. 点击"导出"按钮（在"数据列表"旁边）
  log('   步骤1: 探测导出按钮...');

  // 先扫描页面上所有含"导出"的元素并打印
  const candidates = await page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    const results = [];
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (text.includes('导出') || text.includes('下载')) {
        const rect = el.getBoundingClientRect();
        // 只保留可见且有一定大小的元素
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            tag: el.tagName.toLowerCase(),
            class: el.className || '',
            id: el.id || '',
            text: text.substring(0, 50),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
    }
    return results.slice(0, 20); // 最多20个
  });

  log(`   扫描到 ${candidates.length} 个含"导出/下载"的候选元素:`);
  candidates.forEach((c, i) => {
    log(`     [${i}] <${c.tag}> class="${c.class}" id="${c.id}" text="${c.text}" (${c.width}×${c.height})`);
  });

  await takeScreenshot(page, 'before-export');

  // 通过 JS 直接点击导出按钮（精确匹配"导出"而非"导出记录"）
  log('   尝试点击导出按钮...');
  const clicked = await page.evaluate(() => {
    // 策略1: 找 .left-btn 容器内的按钮（最精确）
    const leftBtn = document.querySelector('.left-btn, .left-btn.ml-8');
    if (leftBtn) {
      const btn = leftBtn.querySelector('button, .arco-btn') || leftBtn;
      btn.click();
      return { success: true, method: '.left-btn' };
    }

    // 策略2: 在表格头部区域找文字恰好是"导出"的元素
    const tableHead = document.querySelector('.default-table-head, .table-head, [class*="table-head"]');
    if (tableHead) {
      const exportEl = tableHead.querySelector('.left-btn, .export-btn');
      if (exportEl) {
        exportEl.click();
        return { success: true, method: 'table-head .left-btn' };
      }
    }

    // 策略3: 全局找文字恰好是"导出"（排除"导出记录"）
    const allElements = document.querySelectorAll('button, .arco-btn, div, span, a');
    for (const el of allElements) {
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      // 精确匹配：text === '导出'，或者是单个字符但包含导出图标的情况
      if (text === '导出' && el.offsetParent !== null) {
        el.click();
        return { success: true, method: 'text===导出' };
      }
    }

    return { success: false };
  });

  if (clicked.success) {
    log(`   ✅ 已点击导出按钮 (method: ${clicked.method})`);
  } else {
    log('❌ 无法点击导出按钮');
    return null;
  }

  await page.waitForTimeout(1000);
  log('   ✅ 已点击导出');

  // 2. 在弹出的"订单导出"对话框中点击"确定"
  log('   步骤2: 点击确认对话框...');
  const confirmBtn = page.locator('.arco-modal, .arco-dialog, [class*="modal"], [class*="dialog"]', {
    hasText: /订单导出/
  }).locator('button, .arco-btn', {
    hasText: /确定|确认|导出/
  }).first();

  // 备选：直接找对话框里的确定按钮
  const confirmBtnAlt = page.locator('.arco-modal-footer button >> text=确定, .arco-dialog-footer button >> text=确定').first();

  if (await confirmBtn.count() > 0) {
    await confirmBtn.click();
  } else if (await confirmBtnAlt.count() > 0) {
    await confirmBtnAlt.click();
  } else {
    log('   ⚠️ 未找到确认按钮，尝试点击页面中任何包含"确定"的按钮');
    const anyConfirm = page.locator('button', { hasText: '确定' }).last();
    if (await anyConfirm.count() > 0) await anyConfirm.click();
  }

  log('   ✅ 已确认导出');
  await page.waitForTimeout(2000);

  // 3. 点击"导出记录"按钮打开右侧面板
  log('   步骤3: 点击导出记录按钮打开面板...');
  try {
    const recordBtn = await page.evaluate(() => {
      const allBtns = document.querySelectorAll('button, .arco-btn, div, span');
      for (const el of allBtns) {
        const text = (el.textContent || '').trim().replace(/\s+/g, '');
        if (text === '导出记录' && el.offsetParent !== null) {
          el.click();
          return { clicked: true, tag: el.tagName.toLowerCase() };
        }
      }
      return { clicked: false };
    });

    if (recordBtn.clicked) {
      log('   ✅ 已点击导出记录按钮');
    } else {
      log('   ⚠️ 未找到导出记录按钮，可能面板已在页面中');
    }
    await page.waitForTimeout(3000);
  } catch (e) {
    log('   ⚠️ 点击导出记录按钮失败:', e.message);
  }

  // 4. 轮询最新的导出任务，等待"导出中..."变为"下载"
  log('   步骤4: 轮询导出状态...');
  const startTime = Date.now();
  let downloadUrl = null;

  while (Date.now() - startTime < CONFIG.pollTimeout) {
    const status = await page.evaluate(() => {
      // 策略1: 找 arco-drawer 内的 list-item（抖老板导出记录面板）
      let rows = document.querySelectorAll('.arco-drawer .list-item, [class*="drawer"] .list-item');

      // 策略2: 如果上面没找到，找包含"导出中"或"下载"文字的任何容器
      if (rows.length === 0) {
        const allElements = document.querySelectorAll('div, tr, li');
        const exportItems = [];
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          const isExportRelated = text.includes('导出中') || text.includes('下载');
          const isOrderList = text.includes('达人信息') || text.includes('商品信息') || text.includes('付款时间') || text.includes('订单状态');
          if (isExportRelated && !isOrderList && el.children.length >= 2) {
            exportItems.push(el);
          }
        }
        rows = exportItems.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 100 && rect.height > 30 && rect.height < 500;
        });
      }

      if (rows.length === 0) return { found: false };

      const firstRow = rows[0];
      const text = firstRow.textContent || '';

      // 检查是否有下载按钮
      const downloadBtn = firstRow.querySelector('button, a, [class*="download"], [class*="下载"]');
      const hasDownload = downloadBtn !== null;

      // 检查是否还在导出中
      const isExporting = text.includes('导出中') || text.includes('处理中') || text.includes('生成中');

      // 尝试提取下载链接
      let url = null;
      if (downloadBtn) {
        url = downloadBtn.getAttribute('href') || downloadBtn.dataset.url || downloadBtn.dataset.link;
      }

      return {
        found: true,
        text: text.substring(0, 100),
        isExporting,
        hasDownload,
        url,
      };
    });

    if (!status.found) {
      log('   ⏳ 未找到导出记录，继续等待...');
    } else if (status.isExporting) {
      log(`   ⏳ 导出中... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    } else if (status.hasDownload) {
      log('   ✅ 导出完成，发现下载按钮');
      // 即使 URL 为 null，也继续尝试点击下载
      downloadUrl = status.url || 'click';
      break;
    } else {
      log(`   ⏳ 状态未知: ${status.text}`);
    }

    await page.waitForTimeout(CONFIG.pollInterval);
  }

  if (!downloadUrl) {
    log('   ❌ 轮询超时，未找到下载按钮');
    return null;
  }

  // 5. 点击下载按钮，触发真正的浏览器下载
  log('   步骤5: 点击下载...');

  // 设置网络响应拦截，捕获下载请求
  let downloadResponse = null;
  let downloadRequest = null;
  const responseHandler = (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (url.includes('.xlsx') || url.includes('download') || url.includes('export') || contentType.includes('octet-stream') || contentType.includes('excel')) {
      log(`   🌐 捕获下载响应: ${url.substring(0, 100)}`);
      downloadResponse = response;
    }
  };
  const requestHandler = (request) => {
    const url = request.url();
    if (url.includes('download') || url.includes('export') || url.includes('.xlsx')) {
      log(`   📤 捕获下载请求: ${url.substring(0, 120)}`);
      downloadRequest = request;
    }
  };
  page.on('response', responseHandler);
  page.on('request', requestHandler);

  // 同时尝试等待下载事件（备用）
  let downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

  // 点击下载按钮（使用 Playwright 的真实点击，支持 React/Vue 事件委托）
    try {
    // 找第一条包含"下载"的 list-item 里的 .btn-download
    const downloadLocator = page.locator('.arco-drawer .list-item, [class*="drawer"] .list-item')
      .filter({ hasText: '下载' })
      .first()
      .locator('.btn-download, .item-op')
      .first();
    
    if (await downloadLocator.count() > 0) {
      await downloadLocator.click();
      log('   ✅ 已点击下载按钮');
    } else {
      log('   ⚠️ 未找到下载按钮');
    }
  } catch (e) {
    log('   ⚠️ 点击下载失败:', e.message);
  }

  await page.waitForTimeout(5000);

  // 获取拦截到的下载 URL
  const capturedUrl = await page.evaluate(() => window.__capturedDownloadUrl);
  if (capturedUrl) {
    
  } else {
      }

  // 尝试多种方式获取下载文件
  let excelPath = null;

  // 方式1: Playwright 下载事件
  const download = await downloadPromise;
  if (download) {
    const suggestedFilename = download.suggestedFilename();
    excelPath = path.join(DOWNLOAD_DIR, suggestedFilename);
    await download.saveAs(excelPath);
    log(`   ✅ Playwright 下载完成: ${suggestedFilename}`);
  }

  // 方式2: 网络响应拦截
  if (!excelPath && downloadResponse) {
    try {
      const buffer = await downloadResponse.body();
      const url = downloadResponse.url();
      const filename = url.split('/').pop().split('?')[0] || `douboss-export-${Date.now()}.xlsx`;
      excelPath = path.join(DOWNLOAD_DIR, filename);
      fs.writeFileSync(excelPath, buffer);
      log(`   ✅ 网络响应下载完成: ${filename}`);
    } catch (e) {
      log('   ⚠️ 网络响应下载失败:', e.message);
    }
  }

  page.off('response', responseHandler);
  page.off('request', requestHandler);

  if (!excelPath) {
    log('   ❌ 无法获取下载文件');
    return null;
  }

  log(`   ✅ 下载完成: ${excelPath}`);
  return excelPath;
}

// ==================== Excel 解析 ====================

async function parseOrderExcel(filePath) {
  log('📖 解析订单明细 Excel...');

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  log(`   共 ${rawData.length} 行 (含表头)`);

  if (rawData.length === 0) return [];

  // 打印表头和样本行用于调试
  log(`   表头: ${rawData[0].join(' | ')}`);
  if (rawData.length > 1) {
    log(`   第2行: ${rawData[1].join(' | ')}`);
  }
  if (rawData.length > 2) {
    log(`   第3行: ${rawData[2].join(' | ')}`);
  }

  const headerRow = rawData[0];

  // 自动识别列索引
  const colMap = {
    accountName: findColumnIndex(headerRow, ['抖音号名称(备注)', '抖音号名称', '抖音号', '达人', '账号', '主播']),
    date: findColumnIndex(headerRow, ['付款时间', '时间', '日期', '创建时间']),
    amount: findColumnIndex(headerRow, ['付款金额', '金额', '实付金额', '订单金额']),
    commission: findColumnIndex(headerRow, ['预估收入', '佣金', '预计佣金', '收入']),
    netCommission: findColumnIndex(headerRow, ['净佣金', '净收入', '预计净佣金']),
    orderStatus: findColumnIndex(headerRow, ['订单状态', '状态']),
  };

  log(`   列映射: ${JSON.stringify(colMap)}`);

  // 按 (账号名, 日期) 聚合
  const aggMap = new Map(); // key: "账号名|日期" -> { name, date, orders, net_income }

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];

    // 提取账号名
    let accountName = '';
    if (colMap.accountName >= 0) {
      accountName = String(row[colMap.accountName] || '').trim();
      // 抖老板导出可能包含备注，去掉括号
      accountName = accountName.split('(')[0].split('（')[0].trim();
    }

    // 提取日期
    let dateStr = ''; // 优先从 Excel 行内提取
    if (colMap.date >= 0) {
      const dateVal = row[colMap.date];
      if (dateVal) {
        // 可能是 Date 对象或字符串
        if (dateVal instanceof Date) {
          dateStr = `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, '0')}-${String(dateVal.getDate()).padStart(2, '0')}`;
        } else {
          const match = String(dateVal).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
          if (match) dateStr = `${match[1]}-${match[2]}-${match[3]}`;
        }
      }
    }
    // 如果 Excel 里没提取到日期，兜底用起始日期
    if (!dateStr) dateStr = CONFIG.startDate;

    // 提取净佣金 = 预估收入 × 0.9（扣除10%技术服务费）
    let netIncome = 0;
    if (colMap.commission >= 0) {
      const commission = parseFloat(String(row[colMap.commission]).replace(/[¥,\s]/g, '')) || 0;
      netIncome = Math.round(commission * 0.9 * 100) / 100; // 扣除10%技术服务费
    }

    // 检查订单状态：跳过退款/退货/取消的订单
    if (colMap.orderStatus >= 0) {
      const status = String(row[colMap.orderStatus] || '');
      if (status.includes('退款') || status.includes('退货') || status.includes('取消')) {
        continue; // 不计入统计
      }
    }

    // 过滤无效数据：只要账号名为空就跳过（佣金为0的订单仍然算单量）
    if (!accountName) continue;

    const key = `${accountName}|${dateStr}`;
    if (!aggMap.has(key)) {
      aggMap.set(key, { name: accountName, date: dateStr, orders: 0, net_income: 0 });
    }

    const agg = aggMap.get(key);
    agg.orders += 1; // 订单数 +1
    agg.net_income = Math.round((agg.net_income + netIncome) * 100) / 100;
  }

  const records = Array.from(aggMap.values());
  
  // 防御性去重：确保没有重复的 (name, date)
  const seen = new Set();
  const uniqueRecords = records.filter(r => {
    const key = `${r.name}|${r.date}`;
    if (seen.has(key)) {
      log(`   ⚠️ 聚合结果中发现重复键: ${key}，跳过`);
      return false;
    }
    seen.add(key);
    return true;
  });
  
  if (uniqueRecords.length < records.length) {
    log(`   去重前: ${records.length} 条, 去重后: ${uniqueRecords.length} 条`);
  }
  
  log(`   聚合后: ${uniqueRecords.length} 个账号×日期组合`);
  return uniqueRecords;
}

function findColumnIndex(headerRow, keywords) {
  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i] || '').trim();
    for (const kw of keywords) {
      if (header.includes(kw)) return i;
    }
  }
  return -1;
}

// ==================== 推送 ====================

async function pushData(records) {
  // 按日期分组成 { '2026-05-10': [...], '2026-05-11': [...], ... }
  const byDate = new Map();
  for (const r of records) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  let totalAccounts = 0;
  let totalRecords = 0;
  const allUnmatched = [];

  for (const [date, dayRecords] of byDate) {
    log(`📤 推送 ${date} 的数据: ${dayRecords.length} 条`);
    log(`   样本: ${dayRecords.slice(0, 3).map(r => `${r.name}(${r.orders}单,${r.net_income})`).join(', ')}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, stats: dayRecords }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json();
    if (!json.success) {
      log(`   ${date} API 返回:`, JSON.stringify(json));
      throw new Error(`${date}: ${json.error || '推送失败'}`);
    }

    log(`   ✅ ${date} 推送成功：匹配 ${json.accounts} 个账号，更新 ${json.records || 0} 条`);
    totalAccounts += json.accounts || 0;
    totalRecords += json.records || 0;
    if (json.unmatched && json.unmatched.length > 0) {
      allUnmatched.push(...json.unmatched);
    }
  }

  log(`✅ 全部推送成功：共 ${byDate.size} 天，匹配 ${totalAccounts} 个账号，更新 ${totalRecords} 条`);
  if (allUnmatched.length > 0) {
    log(`   ⚠️ 未匹配账号: ${[...new Set(allUnmatched)].join(', ')}`);
  }
}

// ==================== 入口 ====================
main();
