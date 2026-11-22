import {Marked} from 'marked';

// One grammar for browser rendering and server reference validation.
export function articleExtensions(renderReference=token=>token.raw){
  return [
    {name:'wikiReference',level:'inline',start:source=>source.indexOf('[['),
      tokenizer(source){const m=/^\[\[(item|enemy|quest):([^|\]\n]+)\|([^\]\n]+)\]\]/.exec(source);if(m)return {type:'wikiReference',raw:m[0],kind:m[1],id:m[2],label:m[3],display:'inline'};},
      renderer:renderReference},
    {name:'wikiCard',level:'block',start(source){return source.match(/^\{\{/m)?.index;},
      tokenizer(source){const m=/^\{\{(item|enemy|quest):([^|}\n]+)\|([^}\n]+)\}\}(?:\n|$)/.exec(source);if(m)return {type:'wikiCard',raw:m[0],kind:m[1],id:m[2],label:m[3],display:'card'};},
      renderer:renderReference},
  ];
}
const parser=new Marked({gfm:true,extensions:articleExtensions()});
export function imageCaption(token){
  return token.tokens?.map(part=>part.type==='escape'?part.text:part.raw).join('')??token.text;
}
export function markdownReferences(body){
  const references=[];
  parser.walkTokens(parser.lexer(body),token=>{
    if(token.type==='wikiReference'||token.type==='wikiCard')references.push({kind:token.kind,id:token.id,label:token.label});
    else if(token.type==='image'&&token.href.startsWith('media:'))references.push({kind:'media',id:token.href.slice(6),label:imageCaption(token)});
  });
  return references;
}
