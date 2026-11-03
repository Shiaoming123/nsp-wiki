import {Marked} from 'marked';
import DOMPurify from 'dompurify';
const escape=value=>{const node=document.createElement('span');node.textContent=value;return node.innerHTML;};
const parser=new Marked({gfm:true,breaks:true,renderer:{
  html:token=>escape(token.text),image:token=>escape(token.text||'图片'),checkbox:token=>token.checked?'☑ ':'☐ '
}});
function render(node,source){
  const fragment=DOMPurify.sanitize(parser.parse(source),{
    ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','hr','pre','code','a','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR:['href','title','start'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true
  });
  for(const link of fragment.querySelectorAll('a')){
    try{const href=link.getAttribute('href'),url=new URL(href,location.href);if(!href||!['http:','https:'].includes(url.protocol))throw Error();link.rel='noopener noreferrer';if(url.origin!==location.origin)link.target='_blank';}
    catch{link.replaceWith(...link.childNodes);}
  }
  for(const table of fragment.querySelectorAll('table')){const wrap=document.createElement('div');wrap.className='post-markdown-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','攻略表格，可横向滚动');table.replaceWith(wrap);wrap.append(table);}
  for(const code of fragment.querySelectorAll('pre')){code.tabIndex=0;code.setAttribute('role','region');code.setAttribute('aria-label','代码，可横向滚动');}
  node.classList.add('post-markdown');node.replaceChildren(fragment);return node;
}
function plain(source){return render(document.createElement('div'),source).textContent.replace(/\s+/g,' ').trim();}
window.PostMarkdown={render,plain};
