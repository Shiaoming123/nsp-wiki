(() => {
  'use strict';
  function classifyMission(mission,itemIds){
    const tags=[],coordinates=[],recycles=[],pending=[];
    for(const [phase,rows] of [['finReward',mission.reward||[]],['preReward',mission.preReward||[]]])for(const row of rows){
      if(row.type!=='Coordinate')continue;
      if(row.referenceStatus!=='RESOLVED'||!row.data||!row.nameZh){pending.push({kind:'coordinate',phase});continue;}
      coordinates.push({phase,id:row.data,name:row.nameZh,count:Number.isFinite(row.count)?row.count:null});
    }
    for(const trigger of mission.triggers||[]){
      if(trigger.type!=='recycle'||trigger.role!=='activation')continue;
      if(!itemIds.has(trigger.itemId)){pending.push({kind:'recycle'});continue;}
      recycles.push({itemId:trigger.itemId,count:Number.isSafeInteger(trigger.count)&&trigger.count>0?trigger.count:null});
    }
    if(coordinates.some(c=>c.phase==='finReward'))tags.push({kind:'coordinate',label:'获得地图坐标'});
    if(recycles.length)tags.push({kind:'recycle',label:'回收物品接取'});
    if(coordinates.some(c=>c.phase==='preReward'))tags.push({kind:'pre-coordinate',label:'事前获得坐标'});
    return {tags,coordinates,recycles,pending};
  }
  const api={classifyMission};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.QuestSemantics=api;
})();
