(() => {
  'use strict';
  const key='nsp-welcome-daily-v1',triggers=[...document.querySelectorAll('[data-welcome-open],#welcome-reopen')],trigger=triggers[0];
  if(!trigger)return;
  const chapters=[['官方','game'],['本站','wiki'],['任务','tasks'],['地图','maps'],['夯拉榜','ranking'],['查资料','reference'],['工坊','workshop'],['反馈交流','feedback']];
  const dialog=document.createElement('dialog');dialog.id='wiki-welcome';dialog.setAttribute('aria-label','查无此地 Wiki 使用指引');
  // Fixed editorial markup only; current data and example input are inserted as text.
  dialog.innerHTML=`
    <div class="welcome-shell">
      <header class="welcome-top"><span><i aria-hidden="true"></i>查无此地 · 探索前的使用指引</span><button type="button" class="welcome-close" aria-label="关闭介绍">×</button></header>
      <div class="welcome-layout"><nav class="welcome-chapters" aria-label="使用指引章节"></nav><div class="welcome-stage" aria-roledescription="轮播" aria-label="八章使用指引">
        <article class="welcome-card welcome-wiki" aria-labelledby="welcome-wiki-title" data-side="active">
          <div class="welcome-copy">
            <p class="welcome-section">一份玩家共建的生存手册</p>
            <h2 id="welcome-wiki-title">进入未知之前，<br>先把情报带上。</h2>
            <p class="welcome-lead">欢迎来到《查无此地》Wiki。<br>从四个频道找到方向，也可以直接搜索物品、任务或机制，为下一次行动准备情报。</p>
            <dl class="welcome-features">
              <div><dt>资料库</dt><dd>查物品、敌怪、NPC、制作配方与腐化词条，也能直达地图。</dd></div>
              <div><dt>探索与任务</dt><dd>沿任务线找目标，在地图上定位容器、查看物资，准备探索和镜柜兑换。</dd></div>
              <div><dt>配装与机制</dt><dd>装配武器、比较多套方案，读懂属性、状态与计算示例。</dd></div>
              <div><dt>玩家社区</dt><dd>分享排行与配装，交流反馈；从流量看板了解热门资料和最近互动。</dd></div>
            </dl>
            <p class="welcome-note">查阅无需登录；发帖、留言与反馈提交需要账号。任务标记和本地配装保存在当前浏览器，不读取游戏存档。关闭资料卡片后，可以接着刚才的位置继续浏览。</p>
            <details class="welcome-site-details"><summary>主站、账号与资料维护</summary><p>当前主站：<a href="https://nsp-wiki.shiaoming.cn/">nsp-wiki.shiaoming.cn</a>。本站由站主自有腾讯云服务器独立托管，社区使用独立数据库。</p><p>原 Sites 站的账号与社区内容未迁移，旧用户需重新注册，同名账号不会继承旧站身份。本站已有反馈保留，可在原帖下继续讨论；站主回复带有身份标识，普通注册不会获得站主管理权限。</p><p>物品来源、敌怪攻击、机制与状态持续整理；地图可直接查看资源点及对应容器物资。具体变化集中记录在更新档案，发现遗漏可在关联页面提交反馈。</p><p>主站与原 Sites 为独立发布入口。首页会显示最新 Wiki 更新，更新档案保留历史，并区分游戏公告和本站维护。<a class="welcome-route" href="#updates">查看更新档案 ↗</a></p><p>本站是玩家维护的非官方资料站。游戏名称、图像与相关素材归原权利人所有，仅用于资料说明；请通过“官方”章节了解游戏和制作组。资料错误或版权问题可通过 Wiki 反馈提供关联页与具体情况，请勿填写私人信息。</p></details><a class="welcome-route" href="#home">从四个频道开始 ↗</a>
          </div>
          <div class="welcome-terminal" aria-hidden="true">
            <div class="terminal-status"><span class="terminal-lamp"></span>情报终端<span>在线</span></div>
            <div class="terminal-display">
              <div class="terminal-heading">查无此地<small>生存手册</small></div>
              <div class="terminal-modules">
                <div><span class="terminal-icon"><img data-src="/icons/ea/ea-item-0685.png" width="44" height="44" alt=""></span><span>物资档案<small>属性 / 获取 / 配装</small></span></div>
                <div><span class="terminal-icon"><img data-src="/ui/quest-mail.png" width="26" height="26" alt=""></span><span>任务网络<small>前置 / 线索 / 奖励</small></span></div>
                <div><span class="terminal-icon"><img data-src="/ui/quest-message.png" width="26" height="26" alt=""></span><span>玩家观点<small>夯拉榜 / 攻略 / 讨论</small></span></div>
              </div>
              <div class="terminal-readout"><span>探索前，先查阅。</span><img data-src="/ui/ea/item_property_rangeBG.png" width="220" height="10" alt=""></div>
            </div>
            <div class="terminal-foot"><span>由玩家记录 · 为探索准备</span><span class="terminal-vents"></span></div>
          </div>
        </article>

        <article class="welcome-card welcome-guide welcome-tasks" aria-labelledby="welcome-tasks-title" data-side="right" inert aria-hidden="true">
          <div class="welcome-copy"><p class="welcome-section">任务 · 先找到目标，再顺着线走</p><h2 id="welcome-tasks-title">下一步，<br>就在任务线上。</h2><ol class="welcome-steps"><li><strong>先找任务</strong><span>搜索名称或目标，按邮件、消息、目标类型筛选。</span></li><li><strong>看清关系</strong><span>点节点看前置与奖励，整条任务线高亮；拖动画布、滚轮缩放，点“全览”找回全局。</span></li><li><strong>打开左侧物品清单</strong><span>按 Wiki 任务定义汇总收集目标：全部目标 → 排除已完成任务后的未完成 → 扣除手动已备后的还缺。</span></li><li><strong>记下进度与物资</strong><span>标记完成前可预览并补齐前置；可选分支由你选择，也可仅标记当前。已备库存不会自动扣减，记录保存在当前浏览器。</span></li></ol><a class="welcome-route" href="#quests">打开任务图 <span aria-hidden="true">↗</span></a></div>
          <div class="welcome-demo" data-demo="quests"><div class="demo-top"><span>任务流程图</span><small>可交互示例</small></div><div class="demo-task-tools"><input type="search" aria-label="示例搜索任务" placeholder="搜索示例任务"><select aria-label="示例任务筛选"><option value="all">全部任务</option><option value="todo">未标记完成</option><option value="done">已标记完成</option></select></div><div class="demo-quest-nodes"><span class="demo-quest-line" aria-hidden="true"></span><button data-demo-quest="0"><img src="/ui/quest-mail.png" alt="" width="18" height="18"><strong>起点任务</strong><small>未标记</small></button><button data-demo-quest="1" class="selected"><strong>当前任务</strong><small>未标记</small></button><button data-demo-quest="2"><strong>后续任务</strong><small>未标记</small></button></div><div class="demo-task-detail"><span>选中任务</span><strong data-demo-task-name>当前任务</strong><p data-demo-task-status>点选节点，查看整线高亮。</p><button class="demo-mark">标记完成（示例）</button></div><p class="demo-note">这里的标记是练习，不会写入你的任务进度。</p></div>
        </article>
        <article class="welcome-card welcome-guide welcome-maps" aria-labelledby="welcome-maps-title" data-side="right" inert aria-hidden="true">
          <div class="welcome-copy"><p class="welcome-section">地图 · 全局定位，再走近观察</p><h2 id="welcome-maps-title">先看全图，<br>再看实景。</h2><ol class="welcome-steps"><li><strong>平面里找位置</strong><span>先选地图，在平面地图里缩放、拖动；按资源类型筛选，用容器图标找到目标。</span></li><li><strong>切到3D观察</strong><span>点“3D实景”或“查看实景”。默认流畅画质，清晰度可手动选“原始”。</span></li><li><strong>保留周边线索</strong><span>资源筛选与平面地图同步，密集点位会聚合；选中后可定位或切到实景。地图区域按 M 可全屏查看平面地图。</span></li><li><strong>对照本图物资</strong><span>点击地点卡片的物资入口，直接看这个容器可能出现的物品、数量和预估概率；点物品继续查详情。</span></li></ol><a class="welcome-route" href="#maps">打开地图全览 <span aria-hidden="true">↗</span></a></div>
          <div class="welcome-demo" data-demo="maps"><div class="demo-top"><span>地图全览</span><small>地点操作示意</small></div><div class="demo-mode" role="group" aria-label="示例地图模式"><button data-demo-mode="overview" aria-pressed="true">平面地图</button><button data-demo-mode="scene" aria-pressed="false">3D实景</button></div><div class="demo-map" tabindex="0" aria-label="地图操作示意，使用上方按钮切换概览和实景"><div class="demo-map-ground"><i class="demo-building"></i><i class="demo-building"></i><i class="demo-building"></i><i class="demo-roof"></i><button class="demo-poi" data-demo-poi="container" aria-label="示例可搜索容器">▣</button><button class="demo-poi" data-demo-poi="supply" aria-label="示例补给点">◇</button><button class="demo-poi" data-demo-poi="exit" aria-label="示例出入口">↗</button></div><span class="demo-mode-label">平面地图</span></div><div class="demo-map-tools"><button class="demo-highlight" aria-pressed="false">高亮容器</button><label><input class="demo-roof-toggle" type="checkbox" checked>显示屋顶</label></div><p class="demo-note" data-demo-map-note>点选一个地点，周围地点仍会保留。</p></div>
        </article>
        <article class="welcome-card welcome-guide welcome-ranking" aria-labelledby="welcome-ranking-title" data-side="right" inert aria-hidden="true">
          <div class="welcome-copy"><p class="welcome-section">夯拉榜 · 把你的配装观点排出来</p><h2 id="welcome-ranking-title">怎么好用，<br>由你来排。</h2><ol class="welcome-steps"><li><strong>选物品</strong><span>按类别、子分类或名称找物品，点图标加入待排区。</span></li><li><strong>拖动或用按钮</strong><span>放入对应档位，再调整同档左右顺序；浏览器会保留你的榜单。</span></li><li><strong>带走或分享</strong><span>复制图片、导出 PNG；登录后可发布排行与攻略，帖子里的榜单也可复制后继续调整。</span></li></ol><a class="welcome-route" href="#tiers">制作我的夯拉榜 <span aria-hidden="true">↗</span></a></div>
          <div class="welcome-demo" data-demo="tiers"><div class="demo-top"><span>我的夯拉榜</span><small>拖动 / 点选示例</small></div><div class="demo-tier-row" data-demo-row="strong"><span>夯</span><div></div></div><div class="demo-tier-row" data-demo-row="pool"><span>待排区</span><div></div></div><div class="demo-tier-tools"><button data-demo-tier-action="strong">放入夯</button><button data-demo-tier-action="pool">返回待排</button><button data-demo-tier-action="left" aria-label="示例物品左移">←</button><button data-demo-tier-action="right" aria-label="示例物品右移">→</button></div><p class="demo-note" data-demo-tier-note>点选物品，试着拖到“夯”或用按钮移动。</p><div class="demo-export"><span>复制图片</span><span>导出 PNG</span><span>登录后发布</span></div><p class="demo-note">这张小榜单只供练习，不会改变已有排序。</p></div>
        </article>
        <article class="welcome-card welcome-guide welcome-reference" aria-labelledby="welcome-reference-title" data-side="right" inert aria-hidden="true">
          <div class="welcome-copy"><p class="welcome-section">查资料 · 把几个入口连起来看</p><h2 id="welcome-reference-title">一件物品，<br>连着更多情报。</h2><ol class="welcome-steps"><li><strong>从物品查到来源</strong><span>看属性、效果与来源；近战可筛选单手或双手，卡片分开展示轻重击与开火方式，金色显示补充数值。敌怪卡片可对照六维属性、攻击方式与伤害区间。</span></li><li><strong>按地图对照搜刮</strong><span>容器按地图列出物品图标、数量与预估概率，最多展开四排，更多物资在卡片内滚动；点图标查物品。</span></li><li><strong>把数值与状态读明白</strong><span>机制手册用公式、例子和可调数值讲解防御、相位转移与装备腐化；增益与减益集中查看，配合状态图标理解效果。</span></li></ol><div class="welcome-reference-links"><a class="welcome-route" href="#items">物品图鉴 ↗</a><a class="welcome-route" href="#enemies">敌怪图鉴 ↗</a><a class="welcome-route" href="#mirror">镜柜兑换 ↗</a><a class="welcome-route" href="#corruption">腐化词条 ↗</a><a class="welcome-route" href="#workshop">武器工坊 ↗</a><a class="welcome-route" href="#mechanics">机制与状态 ↗</a><a class="welcome-route" href="#loot">容器与搜刮 ↗</a></div></div>
          <div class="welcome-demo" data-demo="reference"><div class="demo-top"><span>情报互相连接</span><small>切换入口看看</small></div><div class="demo-reference-tabs" role="tablist" aria-label="资料入口示例"><button role="tab" data-demo-reference="items" aria-selected="true">物品</button><button role="tab" data-demo-reference="enemies" aria-selected="false">敌怪</button><button role="tab" data-demo-reference="mirror" aria-selected="false">镜柜</button><button role="tab" data-demo-reference="corruption" aria-selected="false">腐化</button></div><div class="demo-reference-panel" role="tabpanel"><div class="demo-reference-icon" aria-hidden="true">◇</div><strong data-demo-reference-title>物品档案</strong><div class="demo-stat-line"><span></span></div><p data-demo-reference-copy>属性、获取方式、使用效果与相关攻略，集中在一张详情里。</p><a class="welcome-route" data-demo-reference-route href="#items">查看物品图鉴 ↗</a></div><div class="demo-reference-flow"><span>物品</span><b>↔</b><span>敌怪 / 地图</span><b>↔</b><span>任务 / 词条</span></div></div>
        </article>
        <article class="welcome-card welcome-guide welcome-workshop" aria-labelledby="welcome-workshop-title" data-side="right" inert aria-hidden="true">
          <div class="welcome-copy"><p class="welcome-section">武器工坊 · 从机匣到你的配装</p><h2 id="welcome-workshop-title">按你的思路，<br>装好下一把武器。</h2><ol class="welcome-steps"><li><strong>先选主武器</strong><span>远程武器展开装配树；近战分单手与双手，直接查看词条与数据，无需安装配件。</span></li><li><strong>点槽位，再选兼容件</strong><span>下方只列兼容配件，点击或拖动装入；“查看属性”可先比较候选与已装部件，关闭后继续配装。</span></li><li><strong>配词条，看红绿变化</strong><span>部件词条会改变兼容候选；移除词条后，不兼容配件会自动卸下。数值沿用游戏样式，红绿突出变化，触发条件另列。</span></li><li><strong>保存、对比与分享</strong><span>命名保存后，可把多套方案加入对比看板并切换基准。配装帖能一键应用到工坊，也可恢复上次试装；游戏内仍需自行装配。</span></li></ol><a class="welcome-route" href="#workshop">打开武器工坊 ↗</a></div>
          <div class="welcome-demo" data-demo="workshop"><div class="demo-top"><span>武器工坊</span><small>独立操作示例</small></div><label class="demo-weapon-select">主武器<select aria-label="示例主武器"><option value="firearm">远程 · 红星 老兵47制</option><option value="melee">近战 · 拳头</option></select></label><div class="demo-weapon-bench"><div class="demo-weapon-tree"><span class="demo-weapon-slot demo-weapon-optic" aria-hidden="true">瞄具<br>＋</span><span class="demo-weapon-slot demo-weapon-stock" aria-hidden="true">枪托<img data-src="/icons/ea/ea-item-0032.png" alt="" width="38" height="24"></span><div class="demo-weapon-slot demo-weapon-core"><span>机匣 / 主武器</span><img data-src="/icons/ea/ea-item-0030.png" alt="" width="60" height="40"><strong data-demo-weapon-name>红星 老兵47制</strong></div><button class="demo-weapon-slot demo-weapon-barrel" aria-label="示例枪管槽，点击装入兼容枪管" aria-pressed="false"><span>枪管</span><span data-demo-barrel-label>＋ 待装配</span></button><span class="demo-weapon-slot demo-weapon-magazine" aria-hidden="true">弹匣<img data-src="/icons/ea/ea-item-0034.png" alt="" width="32" height="24"></span></div><aside class="demo-weapon-stats" aria-label="武器数据排版示意"><span>武器数据</span><div><span data-demo-stat-label>伤害</span><i></i></div><div><span>距离</span><i></i></div><div><span>攻速</span><i></i></div><small>刻度仅示意<br>实际数值请到工坊查看</small></aside></div><div class="demo-weapon-parts"><span>当前槽位 · 枪管</span><button draggable="true" class="demo-weapon-part"><img data-src="/icons/ea/ea-item-0033.png" width="62" height="24" alt=""><span>老兵47制 枪管<small>点击 / 拖到枪管槽</small></span></button></div><p class="demo-note" data-demo-weapon-note aria-live="polite">试着装入枪管，或切换近战武器。</p><p class="demo-note">此处只练习操作，不会更改你的装配方案。</p></div>
        </article>
        <article class="welcome-card welcome-guide welcome-feedback" aria-labelledby="welcome-feedback-title" data-side="right" inert aria-hidden="true">
          <div class="welcome-copy"><p class="welcome-section">交流与反馈 · 让下一位玩家少绕路</p><h2 id="welcome-feedback-title">有发现，<br>就留下线索。</h2><ol class="welcome-steps"><li><strong>在对应地方交流</strong><span>物品与腐化词条详情都有点赞和评论；配装思路可以通过排行、攻略或配装帖子分享。</span></li><li><strong>把问题说具体</strong><span>每条 Wiki 反馈都是独立帖子，原反馈保留；登录后可在原帖下留言、点赞与补充信息，站主回复带有身份标识。</span></li><li><strong>登录后提交</strong><span>浏览资料与反馈无需登录；提交时附上关联页和具体问题。流量看板公开展示热门页面、物品与最近互动，不展示访客身份。</span></li></ol><a class="welcome-route" href="#feedback">打开 Wiki 反馈 <span aria-hidden="true">↗</span></a><a class="welcome-route welcome-route-secondary" href="#tiers">看看玩家排行与攻略 ↗</a><a class="welcome-route welcome-route-secondary" href="#traffic">看看流量看板 ↗</a></div>
          <div class="welcome-demo" data-demo="feedback"><div class="demo-top"><span>一条清楚的反馈</span><small>填写预览示例</small></div><form class="demo-feedback-form"><label>分类<select aria-label="示例反馈分类"><option>资料纠错</option><option>使用问题</option><option>建议</option><option>其他</option></select></label><label>关联页<span class="demo-related-route">腐化词条</span></label><label>具体情况<textarea aria-label="示例反馈内容" rows="3" placeholder="描述需要核对的内容…" maxlength="180"></textarea></label><button type="submit">预览这条示例</button></form><div class="demo-feedback-preview" aria-live="polite" hidden></div><p class="demo-note">预览只在这张卡片显示。正式反馈请到反馈页登录提交。</p></div>
        </article>
        <article class="welcome-card welcome-game" aria-labelledby="welcome-game-title" data-side="right" inert aria-hidden="true">
          <div class="welcome-game-art"><figure><img data-src="/welcome/game-promo.png" width="460" height="215" alt="No Such Place 官方宣传图：异常侵蚀中的绿色走廊"><figcaption>《查无此地》官方宣传图</figcaption></figure><div class="game-art-mark" aria-hidden="true">未知区域<br><span>保持警觉，带回情报。</span></div></div>
          <div class="welcome-copy">
            <p class="welcome-section">认识游戏与制作组</p><h2 id="welcome-game-title">查无此地<br><span>No Such Place</span></h2>
            <p class="welcome-lead">一款俯视角射击撤离游戏。加入 U.R.C.，深入异常维度，搜寻物资与线索，在威胁与时间耗尽之前返回安全屋。</p>
            <a class="welcome-external" href="https://store.steampowered.com/app/3299050/No_Such_Place/" target="_blank" rel="noopener noreferrer"><span>在 Steam 了解游戏<small>游戏介绍、版本动态与愿望单</small></span><span aria-hidden="true">↗</span></a>
            <div class="welcome-official"><p>官方 Bilibili · 暴击组</p><a href="https://space.bilibili.com/3546838852438447" target="_blank" rel="noopener noreferrer" aria-label="打开暴击组官方 Bilibili 主页（新窗口）"><img data-src="/welcome/official-bilibili.png" width="695" height="106" alt="暴击组主页截图，简介为凉屋旗下 Steam 游戏 No Such Place 开发组"></a><span class="welcome-note">开发日志、预告与幕后电台。截图由站主提供，数字为截图时的数据。</span><a class="welcome-official-link" href="https://space.bilibili.com/3546838852438447" target="_blank" rel="noopener noreferrer">前往制作组主页 <span aria-hidden="true">↗</span></a></div>
            <a class="welcome-route welcome-route-secondary" href="#home">回到生存手册首页 ↗</a>
          </div>
        </article>
      </div></div>
      <div class="welcome-bottom"><button type="button" class="welcome-skip">跳过介绍</button><span class="welcome-position" aria-live="polite">1 / 8 · 官方</span><div class="welcome-actions"><button type="button" class="welcome-prev" aria-label="上一章" disabled>←</button><button type="button" class="welcome-next">下一章 <span aria-hidden="true">→</span></button></div></div>
    </div>`;
  document.body.append(dialog);
  const cards=chapters.map(([,name])=>dialog.querySelector('.welcome-'+name)),next=dialog.querySelector('.welcome-next'),prev=dialog.querySelector('.welcome-prev'),nav=dialog.querySelector('.welcome-chapters');
  const dirs=chapters.map(([name],i)=>{const b=document.createElement('button');b.type='button';b.className='welcome-chapter';b.textContent=name;b.setAttribute('aria-label','查看'+name+'指引');b.addEventListener('click',()=>select(i));nav.append(b);return b;});
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
  let index=0,seenDay='',returnFocus=null,touch=null,questData=null,questPromise=null;
  const today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-');};
  function markSeen(){seenDay=today();try{localStorage.setItem(key,seenDay);localStorage.setItem('nsp-welcome-v2','seen');}catch{}}
  function seenToday(){try{return (localStorage.getItem(key)||seenDay)===today();}catch{return seenDay===today();}}
  function select(value){
    value=Math.max(0,Math.min(cards.length-1,value));
    if(cards[index].contains(document.activeElement))next.focus();
    index=value;cards.forEach((card,i)=>{card.inert=i!==index;card.setAttribute('aria-hidden',String(i!==index));card.dataset.side=i===index?'active':i<index?'left':'right';});
    dirs.forEach((b,i)=>{if(i===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    prev.disabled=index===0;next.replaceChildren(document.createTextNode(index===cards.length-1?'进入 Wiki':'下一章'),make('span','','→'));
    dialog.querySelector('.welcome-position').textContent=`${index+1} / ${cards.length} · ${chapters[index][0]}`;
    cards[index].scrollTop=0;
    dirs[index].scrollIntoView({block:'nearest',inline:'nearest'});
    if(chapters[index][1]==='tasks')loadQuestExample();
    if(chapters[index][1]==='ranking')loadTier();
  }
  function open(){if(dialog.open||document.querySelector('dialog[open]'))return;returnFocus=document.activeElement;dialog.querySelectorAll('img[data-src]').forEach(img=>{img.src=img.dataset.src;img.removeAttribute('data-src');});resetExamples();select(0);dialog.showModal();markSeen();next.focus();}
  function close(){markSeen();dialog.close();window.dispatchEvent(new Event('wiki-welcome-dismissed'));if(returnFocus&&returnFocus!==document.body&&returnFocus.isConnected)returnFocus.focus();else trigger.focus({preventScroll:true});}
  function autoOpen(){if(!window.WIKI_STATIC_BUILD&&!seenToday()&&!document.querySelector('dialog[open]'))open();}
  next.addEventListener('click',()=>index===cards.length-1?close():select(index+1));prev.addEventListener('click',()=>select(index-1));
  dialog.querySelector('.welcome-close').addEventListener('click',close);dialog.querySelector('.welcome-skip').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(index+(e.key==='ArrowRight'?1:-1));}else if(e.key==='/')e.stopPropagation();});
  const stage=dialog.querySelector('.welcome-stage');stage.addEventListener('touchstart',e=>{const t=e.touches[0];touch={x:t.clientX,y:t.clientY};},{passive:true});stage.addEventListener('touchcancel',()=>{touch=null;},{passive:true});stage.addEventListener('touchend',e=>{if(!touch)return;const t=e.changedTouches[0],dx=t.clientX-touch.x,dy=t.clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)select(index+(dx<0?1:-1));},{passive:true});
  dialog.querySelectorAll('a.welcome-route').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const route=a.getAttribute('href');if(location.pathname!=='/'){close();location.href='/'+route;return;}const unchanged=location.hash===route;if(!unchanged)location.hash=route;close();if(unchanged)window.Guide?.route();}));

  const questDemo=dialog.querySelector('[data-demo="quests"]'),questButtons=[...questDemo.querySelectorAll('[data-demo-quest]')];let questSelected=1,questDone=new Set();
  function drawQuests(){
    const search=questDemo.querySelector('input').value.trim().toLowerCase(),filter=questDemo.querySelector('select').value;
    questButtons.forEach((b,i)=>{const done=questDone.has(i);b.classList.toggle('selected',i===questSelected);b.classList.toggle('demo-done',done);b.classList.toggle('demo-muted',Boolean(search&&!b.textContent.toLowerCase().includes(search)||filter==='done'&&!done||filter==='todo'&&done));b.querySelector('small').textContent=done?'✓ 已标记':'○ 未标记';});
    questDemo.querySelector('[data-demo-task-name]').textContent=questButtons[questSelected].querySelector('strong').textContent;
    questDemo.querySelector('[data-demo-task-status]').textContent=questDone.has(questSelected)?'已标记完成 · 仅示例':'选中节点后，沿前后关系查看任务线。';
    questDemo.querySelector('.demo-mark').textContent=questDone.has(questSelected)?'取消标记（示例）':'标记完成（示例）';
  }
  async function loadQuestExample(){
    if(questData)return;
    try{
      questPromise ||= fetch('/data/quests.json').then(r=>{if(!r.ok)throw Error();return r.json();});
      const data=await questPromise;const first=data.missions.find(m=>m.id==='GiftWelcome');
      if(!first)throw Error();const chain=[first];while(chain.length<3){const edge=data.edges.find(e=>e.from===chain.at(-1).id&&!chain.some(m=>m.id===e.to));const target=edge&&data.missions.find(m=>m.id===edge.to);if(!target)throw Error();chain.push(target);}
      questData=chain;questButtons.forEach((b,i)=>{b.querySelector('strong').textContent=chain[i].name;b.dataset.exampleQuestId=chain[i].id;});drawQuests();
    }catch{questPromise=null;questDemo.querySelector('[data-demo-task-status]').textContent='关系操作示意；当前任务请在任务图查看。';}
  }
  questButtons.forEach((b,i)=>b.addEventListener('click',()=>{questSelected=i;drawQuests();}));questDemo.querySelector('input').addEventListener('input',drawQuests);questDemo.querySelector('select').addEventListener('change',drawQuests);questDemo.querySelector('.demo-mark').addEventListener('click',()=>{questDone.has(questSelected)?questDone.delete(questSelected):questDone.add(questSelected);drawQuests();});

  const mapDemo=dialog.querySelector('[data-demo="maps"]');
  function setMapMode(mode){mapDemo.querySelector('.demo-map').classList.toggle('is-scene',mode==='scene');mapDemo.querySelector('.demo-mode-label').textContent=mode==='scene'?'3D实景 · 流畅':'平面地图';mapDemo.querySelectorAll('[data-demo-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.demoMode===mode)));}
  mapDemo.querySelectorAll('[data-demo-mode]').forEach(b=>b.addEventListener('click',()=>setMapMode(b.dataset.demoMode)));
  mapDemo.querySelector('.demo-highlight').addEventListener('click',e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));mapDemo.querySelector('[data-demo-poi="container"]').classList.toggle('is-highlighted',on);});
  mapDemo.querySelector('.demo-roof-toggle').addEventListener('change',e=>mapDemo.querySelector('.demo-roof').classList.toggle('is-hidden',!e.target.checked));
  mapDemo.querySelectorAll('[data-demo-poi]').forEach(b=>b.addEventListener('click',()=>{mapDemo.querySelectorAll('[data-demo-poi]').forEach(n=>n.classList.toggle('is-selected',n===b));mapDemo.querySelector('[data-demo-map-note]').textContent=b.getAttribute('aria-label').replace('示例','')+' · 可在真实地图里定位与查看实景。';}));

  const tierDemo=dialog.querySelector('[data-demo="tiers"]');let tierItems=[],tierRows={strong:[],pool:[]},tierSelected=null,tierDragged=null;
  function initTier(items){if(tierItems.length||!Array.isArray(items))return;tierItems=items.filter(i=>i.icon&&i.category==='weapons').slice(0,3);tierRows={strong:[],pool:tierItems.map(i=>i.id)};tierSelected=tierItems[0]?.id||null;drawTier();}
  function loadTier(){if(tierItems.length)return;if(window.Wiki?.data?.items){initTier(window.Wiki.data.items);return;}fetch('/data/items.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(data=>initTier(data?.items)).catch(()=>{});}
  function drawTier(){
    tierDemo.querySelectorAll('[data-demo-row]').forEach(row=>{const list=row.querySelector('div');list.replaceChildren();for(const id of tierRows[row.dataset.demoRow]){const item=tierItems.find(x=>x.id===id);const b=make('button','demo-tier-item'+(tierSelected===id?' selected':''));b.draggable=true;b.title=item.name;b.dataset.demoItemId=id;const art=window.Wiki?.art?window.Wiki.art(item.icon,'demo-tier-art'):make('span','demo-tier-art');if(!window.Wiki?.art){const img=make('img');img.src='/'+item.icon;img.alt='';art.append(img);}b.append(art,make('small','',item.name));b.onclick=()=>{tierSelected=id;drawTier();};b.addEventListener('dragstart',e=>{e.stopPropagation();tierSelected=tierDragged=id;e.dataTransfer.setData('text/plain',id);});b.addEventListener('dragend',()=>{tierDragged=null;});b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();tierSelected=id;moveTier(e.key==='ArrowLeft'?'left':'right');}});list.append(b);}});
    tierDemo.querySelector('[data-demo-tier-note]').textContent=tierSelected?'已选 '+tierItems.find(x=>x.id===tierSelected).name+' · 用按钮或拖动调整。':'点选物品，试着拖到“夯”或用按钮移动。';
  }
  function moveTier(action){if(!tierSelected)return;const row=tierRows.strong.includes(tierSelected)?'strong':'pool';if(action==='left'||action==='right'){const i=tierRows[row].indexOf(tierSelected),j=i+(action==='left'?-1:1);if(j>=0&&j<tierRows[row].length)[tierRows[row][i],tierRows[row][j]]=[tierRows[row][j],tierRows[row][i]];}else{tierRows[row]=tierRows[row].filter(id=>id!==tierSelected);tierRows[action].push(tierSelected);}drawTier();}
  tierDemo.querySelectorAll('[data-demo-tier-action]').forEach(b=>b.addEventListener('click',()=>moveTier(b.dataset.demoTierAction)));tierDemo.querySelectorAll('[data-demo-row]').forEach(row=>{row.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();});row.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();if(tierDragged&&tierItems.some(i=>i.id===tierDragged)){tierSelected=tierDragged;moveTier(row.dataset.demoRow);}});});

  const workshopDemo=dialog.querySelector('[data-demo="workshop"]');let demoBarrel=false;
  function drawWorkshop(){
    const melee=workshopDemo.querySelector('select').value==='melee';workshopDemo.classList.toggle('demo-is-melee',melee);
    workshopDemo.querySelector('[data-demo-weapon-name]').textContent=melee?'拳头':'红星 老兵47制';workshopDemo.querySelector('.demo-weapon-core img').src=melee?'/icons/ea/ea-item-0001.png':'/icons/ea/ea-item-0030.png';
    const slot=workshopDemo.querySelector('.demo-weapon-barrel');slot.setAttribute('aria-pressed',String(demoBarrel));slot.setAttribute('aria-label',demoBarrel?'示例枪管已装入，点击卸下':'示例枪管槽，点击装入兼容枪管');workshopDemo.querySelector('[data-demo-barrel-label]').textContent=demoBarrel?'✓ 已装配':'＋ 待装配';
    workshopDemo.querySelector('[data-demo-stat-label]').textContent=melee?'近战伤害':'伤害';workshopDemo.querySelector('[data-demo-weapon-note]').textContent=melee?'近战无需配件：在实际工坊中设置适用词条，对照右侧数据。':demoBarrel?'枪管已装入。实际工坊会同时更新兼容配件、词条设置与武器数值。':'试着装入枪管，或切换近战武器。';
  }
  workshopDemo.querySelector('select').addEventListener('change',drawWorkshop);
  workshopDemo.querySelector('.demo-weapon-barrel').addEventListener('click',()=>{demoBarrel=!demoBarrel;drawWorkshop();});
  workshopDemo.querySelector('.demo-weapon-part').addEventListener('click',()=>{demoBarrel=true;drawWorkshop();});
  workshopDemo.querySelector('.demo-weapon-part').addEventListener('dragstart',e=>{e.stopPropagation();e.dataTransfer.setData('application/x-nsp-welcome-part','barrel');});
  workshopDemo.querySelector('.demo-weapon-barrel').addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('application/x-nsp-welcome-part')){e.preventDefault();e.stopPropagation();}});
  workshopDemo.querySelector('.demo-weapon-barrel').addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();if(e.dataTransfer.getData('application/x-nsp-welcome-part')==='barrel'){demoBarrel=true;drawWorkshop();}});

  const reference=dialog.querySelector('[data-demo="reference"]'),referenceInfo={items:['物品档案','属性、获取方式、使用效果与相关攻略，集中在一张详情里。','查看物品图鉴'],enemies:['敌怪情报','按层级、地区与地图时间线筛选，查看攻击方式、防护前伤害区间及战利品候选。','查看敌怪图鉴'],mirror:['镜柜兑换','对照投入档位，查看兑换候选与数量条件。','查看镜柜兑换'],corruption:['腐化对照','按分类、部位或物品筛选，用表格对照效果，点词条查看适用物品。','查看腐化词条']};
  function setReference(kind){const [title,copy,label]=referenceInfo[kind];reference.querySelectorAll('[data-demo-reference]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.demoReference===kind)));reference.querySelector('[data-demo-reference-title]').textContent=title;reference.querySelector('[data-demo-reference-copy]').textContent=copy;const a=reference.querySelector('[data-demo-reference-route]');a.textContent=label+' ↗';a.setAttribute('href','#'+kind);}
  reference.querySelectorAll('[data-demo-reference]').forEach(b=>b.addEventListener('click',()=>setReference(b.dataset.demoReference)));
  const feedback=dialog.querySelector('[data-demo="feedback"]');feedback.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const preview=feedback.querySelector('.demo-feedback-preview');preview.hidden=false;preview.replaceChildren(make('strong','',feedback.querySelector('select').value),make('p','',feedback.querySelector('textarea').value.trim()||'请核对这页资料中的具体内容。'));});
  function resetExamples(){demoBarrel=false;workshopDemo.querySelector('select').value='firearm';drawWorkshop();questSelected=1;questDone=new Set();questDemo.querySelector('input').value='';questDemo.querySelector('select').value='all';drawQuests();setMapMode('overview');mapDemo.querySelector('.demo-roof-toggle').checked=true;mapDemo.querySelector('.demo-roof').classList.remove('is-hidden');mapDemo.querySelector('.demo-highlight').setAttribute('aria-pressed','false');mapDemo.querySelectorAll('[data-demo-poi]').forEach(b=>b.classList.remove('is-selected','is-highlighted'));tierItems=(window.Wiki?.data?.items||[]).filter(i=>i.icon&&i.category==='weapons').slice(0,3);tierRows={strong:[],pool:tierItems.map(i=>i.id)};tierSelected=tierItems[0]?.id||null;drawTier();setReference('items');feedback.querySelector('form').reset();feedback.querySelector('.demo-feedback-preview').hidden=true;}
  triggers.forEach(button=>{button.hidden=false;button.addEventListener('click',open);});window.addEventListener('wiki-ready',()=>{if(dialog.open&&!tierItems.length)loadTier();autoOpen();});window.addEventListener('hashchange',autoOpen);document.addEventListener('close',autoOpen,true);
  autoOpen();
})();
