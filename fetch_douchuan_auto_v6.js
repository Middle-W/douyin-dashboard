// 抖川助手全自动推送脚本 v6（Ant Design 精确翻页）
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

  // ===== Ant Design 分页专用函数 =====
  const pagination=document.querySelector('.ant-pagination');
  if(!pagination){alert('未找到 Ant Design 分页组件');return;}

  function getTotalPages(){
    const items=pagination.querySelectorAll('.ant-pagination-item');
    let max=0;
    items.forEach(el=>{
      const n=parseInt(el.textContent?.trim()||'0');
      if(n>max) max=n;
    });
    return max;
  }

  function getCurrentPage(){
    const active=pagination.querySelector('.ant-pagination-item-active');
    return parseInt(active?.textContent?.trim()||'1');
  }

  function clickPage(num){
    const item=pagination.querySelector(`.ant-pagination-item-${num} a, .ant-pagination-item-${num} button, .ant-pagination-item[title="${num}"] a, .ant-pagination-item[title="${num}"] button`);
    if(item){item.click();return true;}
    // fallback: 遍历所有 item 找文本匹配
    const items=pagination.querySelectorAll('.ant-pagination-item');
    for(const el of items){
      if(el.textContent?.trim()===''+num){
        const btn=el.querySelector('a, button');
        if(btn){btn.click();return true;}
        el.click();return true;
      }
    }
    return false;
  }

  function clickNext(){
    const nextLi=pagination.querySelector('li.ant-pagination-next');
    if(!nextLi) return false;
    if(nextLi.classList.contains('ant-pagination-disabled')) return false;
    const btn=nextLi.querySelector('a, button');
    if(btn){btn.click();return true;}
    nextLi.click();return true;
  }

  // 回到第1页
  const startPage=getCurrentPage();
  if(startPage!==1){
    console.log('当前在第'+startPage+'页，回到第1页');
    clickPage(1);
    await sleep(2500);
  }

  const totalPages=getTotalPages();
  console.log(`日期:${date} 总${totalPages}页`);

  const results=[];
  let page=1;

  async function waitForRows(maxWaitMs=8000){
    const start=Date.now();
    while(Date.now()-start<maxWaitMs){
      const rows=document.querySelectorAll('table tbody tr');
      if(rows.length>0) return rows.length;
      await sleep(300);
    }
    return 0;
  }

  while(page<=totalPages){
    let rowCount=await waitForRows(6000);
    let retry=0;
    while(rowCount===0 && retry<3){
      console.log(`第${page}页 未加载, 重试${retry+1}`);
      await sleep(1500);
      rowCount=await waitForRows(4000);
      retry++;
    }

    console.log(`第${page}/${totalPages}页 ${rowCount}行`);
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
    console.log(`第${page}页 有效${pageValidCount}条, 累计${results.length}条`);

    if(page>=totalPages){console.log('已到最后一页');break;}

    const clicked=clickNext();
    if(!clicked){
      console.error('无法翻页，停止');
      break;
    }

    page++;
    await sleep(1200);
  }

  const map={};
  results.forEach(r=>{if(!map[r.name])map[r.name]=r.cost});
  const final=Object.entries(map).map(([name,cost])=>({name,cost}));

  console.log(`完成 共${final.length}条/预期约${totalPages*20}条`);console.table(final);

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
