// 抖川助手全自动推送脚本 v5（暴力翻页 + 从页码读总页数）
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

  // ===== 暴力找分页组件 =====
  function findPaginationContainer(){
    const candidates=document.querySelectorAll('ul, div, nav');
    for(const el of candidates){
      const text=el.textContent.trim();
      // 包含页码数字和 > 符号的容器
      if(/\b1\b/.test(text) && />/.test(text) && el.querySelectorAll('li, span, button, a').length>=3){
        return el;
      }
    }
    return null;
  }

  // ===== 暴力找下一页按钮（文本是 > 且是叶子节点）=====
  function findNextBtn(container){
    const scope=container||document.body;
    const all=scope.querySelectorAll('button, a, span, li, div, i');
    for(const el of all){
      if(el.children.length===0 && el.textContent.trim()==='>') return el;
      if(el.children.length===1 && el.children[0].tagName==='I' && el.textContent.trim()===''){
        // 有些用 icon font，检查 class
        const cls=el.className+'';
        if(cls.includes('next') || cls.includes('right')) return el;
      }
    }
    return null;
  }

  // ===== 暴力找当前页码（高亮样式）=====
  function findActivePage(container){
    const scope=container||document.body;
    const nums=scope.querySelectorAll('li, span, button, a');
    for(const el of nums){
      const text=el.textContent.trim();
      if(!/^\d+$/.test(text)) continue;
      const style=window.getComputedStyle(el);
      const cls=el.className+'';
      // 高亮特征：active类、背景色不同、文字颜色不同
      if(cls.includes('active') || cls.includes('current') || cls.includes('selected') ||
         style.backgroundColor!=='rgba(0, 0, 0, 0)' && style.backgroundColor!=='transparent'){
        return parseInt(text);
      }
    }
    return null;
  }

  // ===== 从页码数字找总页数 =====
  function getTotalPages(container){
    const scope=container||document.body;
    const nums=scope.querySelectorAll('li, span, button, a');
    let max=0;
    for(const el of nums){
      const text=el.textContent.trim();
      if(/^\d+$/.test(text)){
        const n=parseInt(text);
        if(n>max) max=n;
      }
    }
    return max;
  }

  // ===== 暴力回到第1页 =====
  async function goToPageOne(container){
    const scope=container||document.body;
    const nums=scope.querySelectorAll('li, span, button, a');
    for(const el of nums){
      if(el.textContent.trim()==='1'){
        el.click();await sleep(2500);return true;
      }
    }
    return false;
  }

  // ===== 主逻辑 =====
  const pagContainer=findPaginationContainer();
  console.log('分页容器:', pagContainer?.className||'未找到');

  let totalPages=getTotalPages(pagContainer);
  console.log('检测到总页数:', totalPages);

  // 如果读不到页码，fallback 到 body text
  if(!totalPages){
    const totalMatch=document.body.innerText.match(/共\s*(\d+)\s*条/);
    const totalItems=totalMatch?parseInt(totalMatch[1]):100;
    const pageSizeMatch=document.body.innerText.match(/(\d+)\s*条\/页/);
    const pageSize=pageSizeMatch?parseInt(pageSizeMatch[1]):20;
    totalPages=Math.ceil(totalItems/pageSize);
    console.log('fallback 总页数:', totalPages);
  }

  // 回到第1页
  const wentToOne=await goToPageOne(pagContainer);
  console.log('回到第1页:', wentToOne);
  if(!wentToOne) console.warn('未能自动回到第1页，将从当前页开始');

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

    // 暴力翻页：点下一页 > 按钮
    const nextBtn=findNextBtn(pagContainer);
    if(!nextBtn){
      console.error('找不到下一页按钮');
      // 尝试直接点页码数字
      const nextPageNum=findActivePage(pagContainer)||page;
      const allNums=(pagContainer||document).querySelectorAll('li, span, button, a');
      let clickedNum=false;
      for(const el of allNums){
        if(el.textContent.trim()===''+(nextPageNum+1)){
          el.click();clickedNum=true;console.log('翻页: 直接点页码',nextPageNum+1);break;
        }
      }
      if(!clickedNum){console.error('所有翻页方式失败');break;}
    }else{
      nextBtn.click();
      console.log('翻页: 点击 >');
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
