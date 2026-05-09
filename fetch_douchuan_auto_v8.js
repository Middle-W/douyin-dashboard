// 抖川助手全自动推送脚本 v8（React 兼容点击 + 页面内日志浮窗）
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

  // ===== 页面内日志浮窗 =====
  const logBox=document.createElement('div');
  logBox.style.cssText='position:fixed;top:10px;right:10px;width:320px;max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.85);color:#0f0;font-family:monospace;font-size:12px;padding:10px;border-radius:8px;z-index:99999;white-space:pre-wrap;word-break:break-all;';
  document.body.appendChild(logBox);
  function log(msg){const line='['+new Date().toLocaleTimeString()+'] '+msg;logBox.textContent+=line+'\n';logBox.scrollTop=logBox.scrollHeight;}

  // ===== React 兼容点击 =====
  function rClick(el){
    if(!el)return false;
    ['mousedown','mouseup','click'].forEach(type=>{
      const ev=new MouseEvent(type,{bubbles:true,cancelable:true,view:window});
      el.dispatchEvent(ev);
    });
    return true;
  }

  function getPagination(){return document.querySelector('.ant-pagination');}

  function getTotalPages(){
    const p=getPagination();
    if(!p)return 0;
    const items=p.querySelectorAll('.ant-pagination-item');
    let max=0;
    items.forEach(el=>{const n=parseInt(el.textContent?.trim()||'0');if(n>max)max=n;});
    return max;
  }

  function getCurrentPage(){
    const p=getPagination();
    if(!p)return 1;
    const active=p.querySelector('.ant-pagination-item-active');
    return parseInt(active?.textContent?.trim()||'1');
  }

  function clickPage(num){
    const p=getPagination();
    if(!p)return false;
    const item=p.querySelector('.ant-pagination-item-'+num);
    if(item){const btn=item.querySelector('a, button');if(btn)return rClick(btn);return rClick(item);}
    // fallback
    const items=p.querySelectorAll('.ant-pagination-item');
    for(const el of items){if(el.textContent?.trim()===''+num){const btn=el.querySelector('a, button');if(btn)return rClick(btn);return rClick(el);}}
    return false;
  }

  function clickNext(){
    const p=getPagination();
    if(!p)return false;
    const nextLi=p.querySelector('li.ant-pagination-next');
    if(!nextLi)return false;
    if(nextLi.classList.contains('ant-pagination-disabled'))return false;
    const btn=nextLi.querySelector('a, button');
    if(btn)return rClick(btn);
    return rClick(nextLi);
  }

  // 回到第1页
  if(getCurrentPage()!==1){
    log('当前第'+getCurrentPage()+'页，回到第1页');
    clickPage(1);
    await sleep(3000);
  }

  const totalPages=getTotalPages();
  log('日期:'+date+' 总'+totalPages+'页');
  if(!totalPages){alert('未检测到分页组件');logBox.remove();return;}

  const results=[];
  let page=1;

  async function waitForRows(maxWaitMs=10000){
    const start=Date.now();
    while(Date.now()-start<maxWaitMs){
      const loading=document.querySelector('.ant-spin, .ant-table-loading');
      const rows=document.querySelectorAll('table tbody tr');
      if(!loading && rows.length>0)return rows.length;
      await sleep(400);
    }
    return 0;
  }

  while(page<=totalPages){
    let rowCount=await waitForRows(8000);
    let retry=0;
    while(rowCount===0 && retry<3){
      log('第'+page+'页 未加载, 重试'+(retry+1));
      await sleep(2000);
      rowCount=await waitForRows(5000);
      retry++;
    }

    const actualPage=getCurrentPage();
    if(actualPage!==page){
      log('页码不匹配: 预期'+page+' 实际'+actualPage+'，修正中...');
      const fixed=clickPage(page);
      if(fixed){await sleep(3000);if(getCurrentPage()!==page){log('修正失败');break;}}
      else{log('修正点击失败');break;}
    }

    log('第'+page+'/'+totalPages+'页 '+rowCount+'行');
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
        if(shortName){results.push({name:shortName,cost});pageValidCount++;}
      }
    });
    log('第'+page+'页 有效'+pageValidCount+'条, 累计'+results.length+'条');

    if(page>=totalPages){log('已到最后一页');break;}

    const clicked=clickNext();
    if(!clicked){
      log('点击>失败，尝试点页码'+(page+1));
      const direct=clickPage(page+1);
      if(!direct){log('所有翻页方式失败，停止');break;}
    }

    page++;
    await sleep(2000);
  }

  const map={};results.forEach(r=>{if(!map[r.name])map[r.name]=r.cost});
  const final=Object.entries(map).map(([name,cost])=>({name,cost}));

  log('完成 共'+final.length+'条/预期约'+(totalPages*20)+'条');

  const t0=performance.now();
  try{
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,costs:final})});
    const json=await res.json();
    const t1=Math.round(performance.now()-t0);
    if(json.success){
      alert('✅推送成功！\n日期:'+date+'\n抓取'+final.length+'条 匹配'+json.accounts+'个账号\n推送耗时:'+t1+'ms');
    }else{
      log('推送失败:'+json.error);
      alert('❌推送失败:'+json.error+(json.unmatched?'\n未匹配:'+json.unmatched.join(', '):''));
    }
  }catch(e){
    alert('❌网络错误:'+e.message);
  }
  logBox.remove();
})();
