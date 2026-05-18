const { chromium } = require('playwright');

const COMPANY_STATE = 'C:\\Users\\W\\Desktop\\Kimi Code\\douyin-dashboard-company\\scripts\\.douchuan-state-company.json';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    args: ['--window-size=1280,900'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('打开抖川登录页面...');
  await page.goto('https://dy.douchuanec.com/#/login', { waitUntil: 'networkidle', timeout: 60000 });

  console.log('请扫码登录抖川...');
  console.log('登录成功后，脚本会自动保存登录态');

  // 等待扫码登录完成（检测到登录后的页面元素）
  await page.waitForURL('**/dashboard**', { timeout: 300000 });

  // 保存登录态
  await context.storageState({ path: COMPANY_STATE });
  console.log('登录态已保存到:', COMPANY_STATE);

  // 继续导航到账户报表页面
  await page.goto('https://dy.douchuanec.com/#/qy_balance', { waitUntil: 'networkidle', timeout: 60000 });
  console.log('已进入账户报表页面，你可以查看户ID了');

  // 保持浏览器打开
  console.log('按回车键关闭浏览器...');
  process.stdin.once('data', async () => {
    await browser.close();
    process.exit(0);
  });
})();
