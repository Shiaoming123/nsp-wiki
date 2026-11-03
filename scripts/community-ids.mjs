import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=name=>JSON.parse(readFileSync('public/data/'+name+'.json','utf8'));
const affixes=read('corruption').affixes.map(a=>a.id);
const pages={mechanic:read('mechanics').mechanics.map(a=>a.id),npc:read('npcs').npcs.map(a=>a.id),recipe:read('recipes').recipes.map(a=>a.id),quest:read('quests').missions.map(a=>a.id),enemy:read('enemies').enemies.map(a=>a.id),maps:JSON.parse(readFileSync('public/maps/data/maps.json','utf8')).map(a=>a.id)};
assert.equal(new Set(affixes).size,affixes.length);
for(const [file,value] of [['affix-ids',affixes],['wiki-page-ids',pages]]){
  const text=JSON.stringify(value,null,2)+'\n';
  if(process.argv.includes('--generate'))writeFileSync('lib/'+file+'.json',text);
  else assert.deepEqual(JSON.parse(readFileSync('lib/'+file+'.json','utf8')),value,file+' needs regeneration');
}
console.log('PASS community entity identities');
