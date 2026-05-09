// 抖川助手全自动推送脚本
// 配置你的API地址后，保存为浏览器书签使用

javascript:(async()=>{
  const API_URL = prompt('请输入你的数据系统API地址：', localStorage.getItem('dc_api_url') || 'http://localhost:3000/api/import-cost-json');
  if(!API_URL)return;
  localStorage.setItem('dc_api_url',API_URL);

  const results=[];
  let page=1;
  let date='';

  for(const i of document.querySelectorAll('input')){
    const ph=i.getAttribute('placeholder')||'',v=i.value||'';
    if((ph.includes('开始')||ph.includes('起始'))&&/^\d{4}-\d{2}-\d{2}$/.test(v)){date=v;break}
  }
  if(!date){const m=document.body.innerText.match(/(\d{4}-\d{2}-\d{2})\s*[~至]\s*\d{4}-\d{2}-\d{2}/);if(m)date=m[1]}
  if(!date)date=new Date().toISOString().slice(0,10);

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const totalMatch=document.body.innerText.match(/共\s*(\d+)\s*条/);
  const totalItems=totalMatch?parseInt(totalMatch[1]):107;
  const totalPages=Math.ceil(totalItems/100);

  while(page<=totalPages){
    await sleep(2000);
    const rows=document.querySelectorAll('table tbody tr');
    rows.forEach(row=>{
      const cells=row.querySelectorAll('td');
      if(cells.length>=5){
        const nameFull=cells[0].textContent.trim();
        const costText=cells[4].textContent.trim().replace(/[¥,\s]/g,'');
        const cost=parseFloat(costText);
        let shortName=nameFull.split('（')[0].trim();
        if(!shortName)shortName=nameFull.substring(0,2);
        if(shortName&&!isNaN(cost))results.push({name:shortName,cost});
      }
    });
    if(page>=totalPages)break;
    const nextBtn=document.querySelector('li.ant-pagination-next');
    if(!nextBtn||nextBtn.classList.contains('ant-pagination-disabled'))break;
    nextBtn.click();page++;
  }

  const map={};
  results.forEach(r=>{if(!map[r.name])map[r.name]=r.cost});
  const final=Object.entries(map).map(([name,cost])=>({name,cost}));

  // Push to API
  try{
    const res=await fetch(API_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date,costs:final})
    });
    const json=await res.json();
    if(json.success){
      alert(`✅ 推送成功！\n日期: ${date}\n共 ${json.records} 条 匹配 ${json.accounts} 个账号${json.unmatched?'\n未匹配: '+json.unmatched.join(', '):''}`);
    }else{
      alert('❌ 推送失败: '+json.error);
    }
  }catch(e){
    alert('❌ 网络错误，请检查API地址是否正确\n'+e.message);
  }
})();
