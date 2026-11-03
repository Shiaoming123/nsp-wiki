(function(){
  'use strict';
  const author={name:'Futura花唯',url:'https://space.bilibili.com/25637137'};
  const entries=[
    {enemyIds:['Office_Fly'],topic:'牛虻',bvid:'BV1fsxv6AECB',title:'【查无此地 No Such Place】牛虻？分明是流氓嘛！',seconds:245,cover:'https://i2.hdslb.com/bfs/archive/810761a5356c3b839608158ae8257491db37195f.jpg'},
    {enemyIds:['ScientistArsonist'],topic:'纵火博士',bvid:'BV1krxs6rEcE',title:'【查无此地 No Such Place】十分热情的纵火博士',seconds:135,cover:'https://i2.hdslb.com/bfs/archive/102bdfe8b048e2ab55dc1b86f9f2e10b819bf6c2.jpg'},
    {enemyIds:['Office_Horse'],topic:'半马人',bvid:'BV1M4n56CEeq',title:'【查无此地 No Such Place】如何优雅而安全的揍马哥',seconds:123,cover:'https://i2.hdslb.com/bfs/archive/2eaa31b93c13d82db55bedf4d4b083a2533d26a3.jpg'},
    {enemyIds:['FallenLeafTeam_Sniper','FallenLeafTeam_Defender','FallenLeafTeam_Raider01','FallenLeafTeam_Raider02','FallenLeafTeam_FreeMan'],topic:'落叶小队',bvid:'BV1SMjw6YEBw',title:'【查无此地 No Such Place】落叶五狗还想成气候？！',seconds:560,cover:'https://i0.hdslb.com/bfs/archive/10cde6304dcc5a1bc96928ef2a0627759fe5ba57.jpg'}
  ];
  const api={entries,author,forEnemy:id=>entries.find(video=>video.enemyIds.includes(id)),durationText:seconds=>Math.floor(seconds/60)+'分'+String(seconds%60).padStart(2,'0')+'秒'};
  if(typeof module==='object'&&module.exports)module.exports=api;else globalThis.EnemyGuideVideos=api;
}());
