// 抖川助手全自动推送脚本 v3（智能等待 + 回到第1页 + 保留零值）
javascript:(async()=>{
  const API_URL=prompt('请输入数据系统API地址：',localStorage.getItem('dc_api_url')||'http://localhost:3000/api/import-cost-json');
  if(!API_URL)return;
  localStorage.setItem('dc_api_url',API_URL);

  let date='';
  for(const i of document.querySelectorAll('input')){
    const ph=i.getAttribute('placeholder')||'',v=i.value||'';
    if((ph.includes('开始')||ph.includes('起始'))&&/^\d{4}-\d{2}-\d{2}$/.test(v)){date=v;break}
  }
  if(!date){const m=document.body.innerText.match(/(\d{4}-\d{2}-\d{2})\s*[~至]\s*\d{4}-\d{2}-\d{2}/);if(m)date=m[1]}
  if(!date)date=new Date().toISOString().slice(0,10);
  date=prompt('请确认推送日期：',date);
  if(!date)return;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const results=[];

  // 先回到第1页
  const pageOneBtn=document.querySelector('.ant-pagination-item[title="1"], .ant-pagination-item-1');
  if(pageOneBtn){pageOneBtn.click();await sleep(2500);}

  let page=1;
  const totalMatch=document.body.innerText.match(/共\s*(\d+)\s*条/);
  const totalItems=totalMatch?parseInt(totalMatch[1]):100;
  const totalPages=Math.ceil(totalItems/100);
  console.log(`日期:${date} 总${totalItems}条 ${totalPages}页`);

  async function waitForTableLoaded(maxWaitMs=8000){
    const start=Date.now();
    while(Date.now()-start<maxWaitMs){
      const loading=document.querySelector('.ant-spin, .ant-table-loading, .ant-skeleton');
      const rows=document.querySelectorAll('table tbody tr');
      if(!loading && rows.length>0) return rows.length;
      await sleep(300);
    }
    return 0;
  }

  while(page<=totalPages){
    let rowCount=await waitForTableLoaded(6000);
    let retry=0;
    while(rowCount===0 && retry<3){
      console.log(`第${page}页 未加载, 重试${retry+1}`);
      await sleep(1500);
      rowCount=await waitForTableLoaded(4000);
      retry++;
    }

    console.log(`第${page}页 ${rowCount}行`);
    const rows=document.querySelectorAll('table tbody tr');
    let pageValidCount=0;
    rows.forEach(row=>{
      const cells=row.querySelectorAll('td');
      if(cells.length>=5){
        const nameFull=cells[0].textContent.trim();
        const costText=cells[4].textContent.trim().replace(/[¥,\s]/g,'');
        const cost=parseFloat(costText)||0;
        let shortName=nameFull.split('（')[0].trim();
        if(!shortName)shortName=nameFull.substring(0,2);
        if(shortName){
          results.push({name:shortName,cost});
          pageValidCount++;
        }
      }
    });
    console.log(`第${page}页 有效${pageValidCount}条`);

    if(page>=totalPages)break;
    const nextBtn=document.querySelector('li.ant-pagination-next');
    if(!nextBtn||nextBtn.classList.contains('ant-pagination-disabled'))break;
    nextBtn.click();page++;
    await sleep(1000);
  }

  const map={};
  results.forEach(r=>{if(!map[r.name])map[r.name]=r.cost});
  const final=Object.entries(map).map(([name,cost])=>({name,cost}));

  console.log(`完成 共${final.length}条/预期${totalItems}条`);console.table(final);

  const t0=performance.now();
  try{
    const res=await fetch(API_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date,costs:final})
    });
    const json=await res.json();
    const t1=Math.round(performance.now()-t0);
    if(json.success){
      alert(`✅推送成功！\n日期:${date}\n抓取${final.length}条 匹配${json.accounts}个账号\n推送耗时:${t1}ms`+(json.unmatched?`\n未匹配:${json.unmatched.join(', ')}`:''));
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
  }catch(e){
    alert('❌网络错误:'+e.message);
  }
})();
