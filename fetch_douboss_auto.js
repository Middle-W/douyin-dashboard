// 抖老板全自动推送脚本
javascript:(async()=>{
  const API_URL=prompt('请输入数据系统API地址：',localStorage.getItem('db_api_url')||'http://localhost:3000/api/import-daily-stats');
  if(!API_URL)return;
  localStorage.setItem('db_api_url',API_URL);

  // 获取日期：从页面文本找 YYYY-MM-DD
  let date='';
  const dateMatch=document.body.innerText.match(/(\d{4}-\d{2}-\d{2})\s*[-~至]\s*\d{4}-\d{2}-\d{2}/);
  if(dateMatch)date=dateMatch[1];
  if(!date){
    const m2=document.body.innerText.match(/(\d{4}-\d{2}-\d{2})/);
    if(m2)date=m2[1];
  }
  if(!date)date=new Date().toISOString().slice(0,10);
  date=prompt('请确认推送日期：',date);
  if(!date)return;

  const results=[];
  let page=1;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  // 获取总页数
  const totalMatch=document.body.innerText.match(/共\s*(\d+)\s*条/);
  const totalItems=totalMatch?parseInt(totalMatch[1]):100;
  const pageSizeMatch=document.body.innerText.match(/(\d+)\s*条\/页/);
  const pageSize=pageSizeMatch?parseInt(pageSizeMatch[1]):10;
  const totalPages=Math.ceil(totalItems/pageSize);
  console.log(`日期: ${date}, 总数据: ${totalItems} 条, ${totalPages} 页, 每页 ${pageSize} 条`);

  while(page<=totalPages){
    await sleep(2000);

    // Arco Design 表格
    const rows=document.querySelectorAll('table tbody tr, .arco-table-body table tbody tr, .arco-table tbody tr');
    console.log(`第 ${page} 页, ${rows.length} 行`);

    rows.forEach(row=>{
      const cells=row.querySelectorAll('td, .arco-table-td');
      if(cells.length>=5){
        // 账号列可能有头像等嵌套元素，取纯文本
        const nameText=cells[1].textContent.trim();
        // 去掉粉丝数、运营人等干扰文本，只保留账号名
        // 通常账号名在第一行
        const name=nameText.split('\n')[0].trim();

        const ordersText=cells[3].textContent.trim().replace(/,/g,'');
        const netIncomeText=cells[4].textContent.trim().replace(/[¥,]/g,'');

        const orders=parseInt(ordersText)||0;
        const netIncome=parseFloat(netIncomeText)||0;

        if(name&&(orders>0||netIncome>0)){
          results.push({name,orders,net_income:netIncome});
        }
      }
    });

    if(page>=totalPages)break;

    // Arco Design 分页：点击下一页
    const nextBtn=document.querySelector('.arco-pagination-item-next, li.arco-pagination-item-next');
    if(!nextBtn||nextBtn.classList.contains('arco-pagination-item-disabled')){
      console.log('已到最后一页');
      break;
    }

    console.log('点击下一页...');
    nextBtn.click();
    page++;
  }

  // 去重
  const map={};
  results.forEach(r=>{map[r.name]=r});
  const final=Object.values(map);

  console.log(`\n=== 完成 === 日期: ${date} 共 ${final.length} 条 ===`);
  console.table(final);

  // 推送到API
  try{
    const res=await fetch(API_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date,stats:final})
    });
    const json=await res.json();
    if(json.success){
      alert(`✅ 推送成功！\n日期: ${date}\n共 ${json.records} 条 匹配 ${json.accounts} 个账号${json.unmatched?'\n未匹配: '+json.unmatched.join(', '):''}`);
    }else{
      alert('❌ 推送失败: '+json.error);
    }
  }catch(e){
    alert('❌ 网络错误: '+e.message);
  }
})();
