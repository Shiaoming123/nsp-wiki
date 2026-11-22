/* Local document decoding; no upload or external conversion is performed here. */
(() => {
'use strict';
const limits={title:80,summary:200,body:30000,version:50,videoUrl:500,videoTitle:80,videoAuthor:80};
function richCompatible(source) {
  let previous='';
  for (const line of source.replace(/\r\n?/g,'\n').split('\n')) {
    if (!line.trim()) {previous='';continue;}
    if (/^!\[((?:\\.|[^\]\\])*)\]\(media:[\w-]+\)$/.test(line) || /^\{\{(item|enemy|quest):[^|}\n]+\|[^}\n]+\}\}$/.test(line)) {previous='atom';continue;}
    let text=line,kind='paragraph';
    if (/^#{2,3}\s+\S/.test(line)) {text=line.replace(/^#{2,3}\s+/,'');kind='heading';}
    else if (line.startsWith('- ')) {text=line.slice(2);kind='list';}
    else if (line.startsWith('> ')) {text=line.slice(2);kind='quote';}
    if (/^\s/.test(text) || / {2,}$/.test(text) || (previous==='list' && kind==='paragraph')) return false;
    // Whitelist the rich editor's grammar. Ambiguous punctuation stays in source mode.
    text=text.replace(/\[\[(item|enemy|quest):[^|\]\n]+\|[^\]\n]+\]\]/g,'reference').replace(/\*\*([^*]+)\*\*/g,'$1');
    if (/[#*_\x60~<>|\\{}\[\]!]/.test(text) || /^\d+[.)]\s/.test(text) || /^[-=]{2,}\s*$/.test(text) || /https?:\/\//i.test(text)) return false;
    previous=kind;
  }
  return true;
}
function validate(draft) {
  for (const [key,max] of Object.entries(limits)) {
    if (draft[key]!==undefined && (typeof draft[key]!=='string' || draft[key].length>max)) throw Error(key+' 超过长度限制或格式不正确（最多 '+max+' 字）');
  }
  if (draft.category!==undefined && !['新手入门','探索路线','敌怪应对','配装心得','任务指引','机制研究'].includes(draft.category) || draft.spoiler!==undefined && !['none','light'].includes(draft.spoiler) || draft.videoEnabled!==undefined && typeof draft.videoEnabled!=='boolean') throw Error('草稿设置格式不正确');
  // Existing backups may contain unfinished video settings; validate those before preview/publication.
  return draft;
}
async function read(file) {
  const extension=/\.(md|markdown|json)$/i.exec(file.name)?.[1].toLowerCase();
  if (!extension) throw Error('请选择 .md、.markdown 或本站导出的 .json 草稿；暂不支持 HTML');
  if (file.size>262144) throw Error('文件不能超过 256 KiB；正文最多 30000 字，图片需单独上传');
  const bytes=await file.arrayBuffer();
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('文件不是有效的 UTF-8 文本，请另存为 UTF-8 后重试');}
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw Error('文件包含非文本内容，请选择 UTF-8 Markdown 或 JSON 草稿');
  if (extension==='json') {
    let data;try{data=JSON.parse(text);}catch{throw Error('JSON 草稿无法解析，请选择本站导出的草稿备份');}
    if (data?.format!=='nsp-guide-draft-v1' || typeof data.draft?.body!=='string') throw Error('草稿格式不正确，请选择本站导出的 JSON 备份');
    return {draft:validate(data.draft),format:'JSON'};
  }
  if (!text.trim()) throw Error('Markdown 文件为空，当前草稿已保留');
  let title=file.name.replace(/\.(md|markdown)$/i,'');
  const heading=/^\n*# [ \t]*(.+?)[ \t]*(?:\n|$)/.exec(text);
  if (heading) {title=heading[1].replace(/[ \t]+#+[ \t]*$/,'');text=text.slice(heading[0].length).replace(/^\n/,'');}
  return {draft:validate({title,body:text}),format:'Markdown'};
}
window.WikiArticleImport={read,richCompatible};
})();
