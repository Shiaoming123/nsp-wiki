const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const legacyBatchIds=['integration','phase1','phase2','wiki-current','phase3','phase3-density','phase4','components','typography','phase5','phase5-density','phase6','phase6-reader','phase7','phase7-table','phase8','dossier-ranking'];
function assertPublicArchive(publicRoot=path.resolve(__dirname,'../public')){
 const root=path.join(publicRoot,'history/visual');if(!fs.existsSync(root))return;
 function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){assert(!entry.isSymbolicLink(),'Public archive cannot contain links');const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else assert.equal(path.relative(root,file),'index.html','Maintenance files must stay outside the website public directory');}}walk(root);
}
function render(){assertPublicArchive();return '<section>'+legacyBatchIds.map(id=>'<span id="'+id+'" aria-hidden="true"></span>').join('')+'<h1>更新档案</h1><p>游戏公告与本站更新统一在更新档案中查看。</p><p><a href="/updates/">查看游戏与本站更新</a></p></section>';}
module.exports={legacyBatchIds,assertPublicArchive,render};
