// 抖老板全自动推送脚本 v3（增强匹配 + debug）
javascript:(async()=>{
  const API_URL=prompt('请输入数据系统API地址：',localStorage.getItem('db_api_url')||'http://localhost:3000/api/import-daily-stats');
  if(!API_URL)return;
  localStorage.setItem('db_api_url',API_URL);

  let date='';
  const m1=document.body.innerText.match(/(\d{4}-\d{2}-\d{2})\s*[-~至]\s*\d{4}-\d{2}-\d{2}/);
  if(m1)date=m1[1];
  if(!date){const m2=document.body.innerText.match(/(\d{4}-\d{2}-\d{2})/);if(m2)date=m2[1]}
  if(!date)date=new Date().toISOString().slice(0,10);
  date=prompt('请确认推送日期：',date);
  if(!date)return;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const results=[];

  // 先回到第1页
  const pageItems=document.querySelectorAll('.arco-pagination-item');
  const pageOne=Array.from(pageItems).find(el=>el.textContent.trim()==='1');
  if(pageOne){pageOne.click();await sleep(2500);}

  let page=1;
  const totalMatch=document.body.innerText.match(/共\s*(\d+)\s*条/);
  const totalItems=totalMatch?parseInt(totalMatch[1]):100;
  const pageSizeMatch=document.body.innerText.match(/(\d+)\s*条\/页/);
  const pageSize=pageSizeMatch?parseInt(pageSizeMatch[1]):10;
  const totalPages=Math.ceil(totalItems/pageSize);
  console.log(`日期:${date} 总${totalItems}条 ${totalPages}页`);

  while(page<=totalPages){
    await sleep(2000);

    const rows=document.querySelectorAll('table tbody tr, .arco-table tbody tr');
    console.log(`第${page}页 ${rows.length}行`);

    rows.forEach(row=>{
      const cells=row.querySelectorAll('td, .arco-table-td');
      if(cells.length>=4){
        const nameEl=cells[1];
        let name='';
        for(const node of nameEl.childNodes){
          if(node.nodeType===3&&node.textContent.trim()){
            name=node.textContent.trim();
            break;
          }
        }
        if(!name)name=nameEl.innerText.trim().split(/\s|\n/)[0];

        const ordersText=cells[3].textContent.trim().replace(/,/g,'');
        const netIncomeText=cells[4].textContent.trim().replace(/[¥,\s]/g,'');
        const orders=parseInt(ordersText)||0;
        const netIncome=parseFloat(netIncomeText)||0;

        if(name&&(orders>0||netIncome>0)){
          results.push({name,orders,net_income:netIncome});
        }
      }
    });

    if(page>=totalPages)break;
    const next=document.querySelector('.arco-pagination-item-next');
    if(!next||next.classList.contains('arco-pagination-item-disabled'))break;
    next.click();page++;
  }

  const map={};results.forEach(r=>{map[r.name]=r});
  const final=Object.values(map);
  console.log(`完成 共${final.length}条`);console.table(final);

  try{
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,stats:final})});
    const json=await res.json();
    if(json.success){
      alert('✅推送成功！\n日期:'+date+'\n共'+json.records+'条 匹配'+json.accounts+'个账号'+(json.unmatched?'
未匹配:'+json.unmatched.join(', '):''));
    }else{
      console.error('推送失败详情:', json);
      let msg='❌推送失败:'+json.error;
      if(json.debug){
        msg+='\n\n📦收到'+json.debug.totalReceived+'条';
        msg+='\n\n🔍原始名称样本:'+json.debug.sampleNames.join(', ');
        msg+='\n\n📋系统账号('+json.debug.dbNames.length+'个):'+json.debug.dbNames.join(', ');
      }else if(json.unmatched){
        msg+='\n未匹配:'+json.unmatched.join(', ');
      }
      alert(msg);
    }
  }catch(e){alert('❌网络错误:'+e.message)}
})();
