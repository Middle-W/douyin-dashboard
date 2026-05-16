(async()=>{
  if(window.__douchuanRunning){console.log('⚠️ 抖船脚本已在运行中，请勿重复执行');return;}
  window.__douchuanRunning=true;
  try{
  const API_URL=prompt('API地址:',localStorage.getItem('dc_api_url')||'http://localhost:3000/api/import-cost-json');
  if(!API_URL){window.__douchuanRunning=false;return;}
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

  function rClick(el){
    if(!el)return false;
    ['mousedown','mouseup','click'].forEach(type=>{
      el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));
    });
    return true;
  }

  function getPage(){
    return parseInt(document.querySelector('.ant-pagination-item-active')?.textContent?.trim()||'1');
  }

  function clickPage(num){
    const items=document.querySelectorAll('.ant-pagination-item');
    for(const el of items){
      if(el.textContent?.trim()===''+num){
        const btn=el.querySelector('a,button');
        return rClick(btn||el);
      }
    }
    return false;
  }

  function clickNext(){
    const nextLi=document.querySelector('li.ant-pagination-next');
    if(!nextLi||nextLi.classList.contains('ant-pagination-disabled'))return false;
    const btn=nextLi.querySelector('a,button');
    return rClick(btn||nextLi);
  }

  if(getPage()!==1){clickPage(1);await sleep(3000);}

  const totalItemsMatch=document.body.innerText.match(/共\s*(\d+)\s*条/);
  const totalItems=totalItemsMatch?parseInt(totalItemsMatch[1]):100;
  const totalPages=Math.ceil(totalItems/20);
  console.log('日期:'+date,'总'+totalItems+'条','约'+totalPages+'页');

  for(let page=1;page<=totalPages;page++){
    // 等待loading消失且表格有数据
    let rows=[];
    let wait=0;
    while(wait<30){
      const loading=document.querySelector('.ant-spin, .ant-table-loading, .ant-skeleton');
      rows=document.querySelectorAll('table tbody tr');
      if(!loading && rows.length>0) break;
      await sleep(400);
      wait++;
    }
    // 如果行数明显不足且不是最后一页，多等几次
    let retry=0;
    while(rows.length<15 && page<totalPages && retry<3){
      await sleep(1000);
      rows=document.querySelectorAll('table tbody tr');
      retry++;
    }
    console.log('第'+page+'/'+totalPages+'页',rows.length+'行');

    let count=0;
    rows.forEach(row=>{
      const cells=row.querySelectorAll('td');
      if(cells.length>=5){
        const nameFull=cells[0].textContent.trim();
        const costText=cells[4].textContent.trim().replace(/[¥,\s]/g,'');
        const cost=parseFloat(costText)||0;
        let shortName=nameFull.split('（')[0].trim();
        if(!shortName)shortName=nameFull.substring(0,2);
        if(shortName){results.push({name:shortName,cost});count++;}
      }
    });
    console.log('有效'+count+'条,累计'+results.length);

    if(page>=totalPages)break;
    const ok=clickNext();
    console.log('翻页'+(ok?'成功':'失败'));
    if(!ok)break;
    await sleep(1500);
  }

  const map={};
  results.forEach(r=>{if(!map[r.name])map[r.name]=r.cost});
  const final=Object.entries(map).map(([name,cost])=>({name,cost}));
  console.log('完成,共'+final.length+'条');console.table(final);

  try{
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,costs:final})});
    const json=await res.json();
    if(json.success){
      alert('✅推送成功！\n日期:'+date+'\n共'+json.records+'条 匹配'+json.accounts+'个账号');
    }else{
      alert('❌推送失败:'+json.error+(json.unmatched?'\n未匹配:'+json.unmatched.join(', '):''));
    }
  }catch(e){alert('❌网络错误:'+e.message)}
  }finally{window.__douchuanRunning=false;}
})();
