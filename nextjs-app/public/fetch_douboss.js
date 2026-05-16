(async()=>{
  if(window.__doubossRunning){console.log('⚠️ 斗老板脚本已在运行中，请勿重复执行');return;}
  window.__doubossRunning=true;
  try{
  const API_URL=prompt('API地址:',localStorage.getItem('db_api_url')||'http://localhost:3000/api/import-daily-stats');
  if(!API_URL){window.__doubossRunning=false;return;}
  localStorage.setItem('db_api_url',API_URL);

  // ===== 日期获取：收集所有候选日期，让用户选择 =====
  const candidates=[];

  // 从所有 input 收集（去掉 ^$ 限制，避免空格换行干扰）
  for(const input of document.querySelectorAll('input')){
    const val=input.value||'';
    const m1=val.match(/(\d{4}-\d{2}-\d{2})\s*[-~]\s*\d{4}-\d{2}-\d{2}/);
    if(m1)candidates.push(m1[1]);
    const m2=val.match(/(\d{4}-\d{2}-\d{2})/);
    if(m2)candidates.push(m2[1]);
  }

  // 从 body text 收集（付款时间后面）
  const bodyText=document.body.innerText;
  const idx=bodyText.indexOf('付款时间');
  if(idx!==-1){
    const m=bodyText.slice(idx,idx+150).match(/(\d{4}-\d{2}-\d{2})\s*[-~至]\s*\d{4}-\d{2}-\d{2}/);
    if(m)candidates.push(m[1]);
  }

  // 去重
  const unique=[...new Set(candidates)];
  console.log('候选日期:',unique);

  let date='';
  if(unique.length===1){
    date=unique[0];
  }else if(unique.length>1){
    const choice=prompt('检测到多个日期，请选择：\n'+unique.map((d,i)=>(i+1)+'. '+d).join('\n')+'\n\n输入序号或日期：',unique[0]);
    date=unique[parseInt(choice)-1]||choice;
  }else{
    const d=new Date();
    date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  date=prompt('请确认推送日期：',date);
  if(!date)return;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const results=[];

  // 先回到第1页
  const pageItems=document.querySelectorAll('.arco-pagination-item');
  const pageOne=Array.from(pageItems).find(el=>el.textContent.trim()==='1');
  if(pageOne){pageOne.click();await sleep(2000);}

  let page=1;
  const totalMatch=document.body.innerText.match(/共\s*(\d+)\s*条/);
  const totalItems=totalMatch?parseInt(totalMatch[1]):100;
  const pageSizeMatch=document.body.innerText.match(/(\d+)\s*条\/页/);
  const pageSize=pageSizeMatch?parseInt(pageSizeMatch[1]):10;
  const totalPages=Math.ceil(totalItems/pageSize);
  console.log('日期:'+date,'总'+totalItems+'条',totalPages+'页');

  async function waitForTableLoaded(maxWaitMs=8000){
    const start=Date.now();
    while(Date.now()-start<maxWaitMs){
      const loading=document.querySelector('.arco-table-loading, .arco-spin, .arco-skeleton');
      const rows=document.querySelectorAll('table tbody tr, .arco-table tbody tr');
      if(!loading && rows.length>0) return rows.length;
      await sleep(300);
    }
    return 0;
  }

  while(page<=totalPages){
    let rowCount=await waitForTableLoaded(6000);
    let retry=0;
    while(rowCount===0 && retry<3){
      console.log('第'+page+'页 未加载, 重试'+(retry+1));
      await sleep(1500);
      rowCount=await waitForTableLoaded(4000);
      retry++;
    }

    console.log('第'+page+'/'+totalPages+'页',rowCount+'行');
    const rows=document.querySelectorAll('table tbody tr, .arco-table tbody tr');
    let pageValidCount=0;
    rows.forEach(row=>{
      const cells=row.querySelectorAll('td, .arco-table-td');
      if(cells.length>=4){
        const nameEl=cells[1];
        let name='';
        for(const node of nameEl.childNodes){
          if(node.nodeType===3&&node.textContent.trim()){name=node.textContent.trim();break;}
        }
        if(!name)name=nameEl.innerText.trim().split(/\s|\n/)[0];
        const ordersText=cells[3].textContent.trim().replace(/,/g,'');
        const netIncomeText=cells[4].textContent.trim().replace(/[¥,\s]/g,'');
        const orders=parseInt(ordersText)||0;
        const netIncome=parseFloat(netIncomeText)||0;
        if(name){
          results.push({name,orders,net_income:netIncome});
          pageValidCount++;
        }
      }
    });
    console.log('第'+page+'页 有效'+pageValidCount+'条,累计'+results.length);

    if(page>=totalPages)break;
    const next=document.querySelector('.arco-pagination-item-next');
    if(!next||next.classList.contains('arco-pagination-item-disabled'))break;
    next.click();page++;
    await sleep(1000);
  }

  const map={};results.forEach(r=>{map[r.name]=r});
  const final=Object.values(map);
  console.log('完成,共'+final.length+'条/预期'+totalItems+'条');console.table(final);

  const t0=performance.now();
  try{
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,stats:final})});
    const json=await res.json();
    const t1=Math.round(performance.now()-t0);
    if(json.success){
      alert('✅推送成功！\n日期:'+date+'\n抓取'+final.length+'条 匹配'+json.accounts+'个账号\n推送耗时:'+t1+'ms');
    }else{
      console.error('推送失败详情:', json);
      let msg='❌推送失败:'+json.error;
      if(json.debug){
        msg+='\n\n📦收到'+json.debug.totalReceived+'条';
        msg+='\n\n🔍原始名称样本:'+json.debug.sampleNames.join(', ');
        msg+='\n\n📋系统账号('+json.debug.dbNames.length+'个):'+json.debug.dbNames.join(', ');
      }
      alert(msg);
    }
  }catch(e){alert('❌网络错误:'+e.message)}
  }finally{window.__doubossRunning=false;}
})();
