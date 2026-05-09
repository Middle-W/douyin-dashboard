// 抖川助手消耗数据抓取脚本 v2
(async () => {
  const results = [];
  let page = 1;
  let date = '';

  // 获取日期
  const allInputs = document.querySelectorAll('input');
  for (const input of allInputs) {
    const ph = input.getAttribute('placeholder') || '';
    const val = input.value || '';
    if ((ph.includes('开始') || ph.includes('起始')) && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      date = val;
      break;
    }
  }
  if (!date) {
    const m = document.body.innerText.match(/(\d{4}-\d{2}-\d{2})\s*[~至]\s*\d{4}-\d{2}-\d{2}/);
    if (m) date = m[1];
  }
  if (!date) date = new Date().toISOString().slice(0, 10);
  console.log('日期:', date);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 先获取总页数
  const totalMatch = document.body.innerText.match(/共\s*(\d+)\s*条/);
  const totalItems = totalMatch ? parseInt(totalMatch[1]) : 107;
  const totalPages = Math.ceil(totalItems / 100);
  console.log(`总数据: ${totalItems} 条, 预计 ${totalPages} 页`);

  while (page <= totalPages) {
    await sleep(2000);

    const rows = document.querySelectorAll('table tbody tr');
    console.log(`第 ${page} 页, ${rows.length} 行`);

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 5) {
        const nameFull = cells[0].textContent.trim();
        const costText = cells[4].textContent.trim().replace(/[¥,\s]/g, '');
        const cost = parseFloat(costText);
        let shortName = nameFull.split('（')[0].trim();
        if (!shortName) shortName = nameFull.substring(0, 2);
        if (shortName && !isNaN(cost)) {
          results.push({ name: shortName, cost });
        }
      }
    });

    if (page >= totalPages) break;

    // 翻页方式1：点页码数字
    const pagerNumbers = document.querySelectorAll('.el-pager .number, .el-pagination .number');
    const activeNum = document.querySelector('.el-pager .active, .el-pagination .active, .el-pager li.active');
    let clicked = false;

    if (activeNum && pagerNumbers.length > 0) {
      const nums = Array.from(pagerNumbers);
      const idx = nums.indexOf(activeNum);
      if (idx >= 0 && idx < nums.length - 1) {
        console.log('点击页码:', nums[idx + 1].textContent);
        nums[idx + 1].click();
        clicked = true;
      }
    }

    // 翻页方式2：点下一页按钮
    if (!clicked) {
      const nextBtn = document.querySelector('.el-pagination .btn-next, .btn-next');
      if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled')) {
        console.log('点击下一页按钮');
        nextBtn.click();
        clicked = true;
      }
    }

    if (!clicked) {
      console.log('无法翻页，停止');
      break;
    }

    page++;
  }

  // 去重
  const map = {};
  results.forEach(r => { if (!map[r.name]) map[r.name] = r.cost; });
  const final = Object.entries(map).map(([name, cost]) => ({ name, cost }));

  console.log(`\n=== 完成 === 日期: ${date} 共 ${final.length} 条 ===`);
  console.table(final);

  const csv = '\ufeff账号,' + date + '\n' + final.map(r => `${r.name},${r.cost}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `消耗_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  alert(`✅ 抓取完成！\n日期: ${date}\n共 ${final.length} 条数据\nCSV 已下载`);
})();
