// 抖川助手 - 消耗数据抓取脚本
// 使用方法：登录抖川助手 → 打开账户报表 → 选好日期 → F12控制台 → 粘贴运行

(async () => {
  const results = [];
  let page = 1;
  let sameCount = 0;
  let lastCount = 0;

  // 获取总页数
  const getTotalPages = () => {
    const pagerText = document.body.innerText;
    const match = pagerText.match(/共\s*(\d+)\s*条/);
    if (match) {
      return Math.ceil(parseInt(match[1]) / 100);
    }
    // 从分页按钮推断
    const pages = document.querySelectorAll('.el-pager li, .number');
    if (pages.length > 0) {
      return Math.max(...Array.from(pages).map(p => parseInt(p.textContent) || 0));
    }
    return 999;
  };

  const totalPages = getTotalPages();
  console.log(`预计总页数: ${totalPages}`);

  while (page <= totalPages) {
    // 抓取当前页
    const rows = document.querySelectorAll('table tbody tr');
    console.log(`第 ${page} 页，找到 ${rows.length} 行`);

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 5) {
        const nameFull = cells[0].textContent.trim();
        const costText = cells[4].textContent.trim().replace(/[¥,\s]/g, '');
        const cost = parseFloat(costText);

        // 取前两个字作为账号名
        const shortName = nameFull.substring(0, 2);

        if (shortName && !isNaN(cost)) {
          results.push({ name: shortName, cost });
        }
      }
    });

    // 检查是否还有下一页
    if (page >= totalPages) break;

    // 防重复检测（如果翻页后数据没变，说明到头了）
    if (results.length === lastCount) {
      sameCount++;
      if (sameCount >= 2) {
        console.log('数据不再增加，停止翻页');
        break;
      }
    } else {
      sameCount = 0;
    }
    lastCount = results.length;

    // 点击下一页
    const nextBtn = document.querySelector('.btn-next:not(.disabled):not([disabled])');
    if (!nextBtn) {
      console.log('没有下一页按钮，停止');
      break;
    }

    nextBtn.click();
    page++;
    console.log(`点击下一页，等待加载...`);
    await new Promise(r => setTimeout(r, 2500));
  }

  // 获取当前页面日期
  let date = new Date().toISOString().slice(0, 10);
  const dateInputs = document.querySelectorAll('input[type="text"]');
  for (const input of dateInputs) {
    const val = input.value;
    if (val && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
      date = val;
      break;
    }
  }

  // 去重（以防万一）
  const unique = {};
  results.forEach(r => { unique[r.name] = r.cost; });
  const finalResults = Object.entries(unique).map(([name, cost]) => ({ name, cost }));

  console.log(`\n=== 抓取完成 ===`);
  console.log(`日期: ${date}`);
  console.log(`共 ${finalResults.length} 条数据`);
  console.table(finalResults);

  // 生成 CSV（格式：账号,日期）
  const csvLines = ['账号,' + date];
  finalResults.forEach(r => {
    csvLines.push(`${r.name},${r.cost}`);
  });
  const csv = '\ufeff' + csvLines.join('\n');

  // 下载
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `消耗_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  alert(`✅ 抓取完成！\n日期: ${date}\n共 ${finalResults.length} 条数据\nCSV 文件已下载`);
})();
