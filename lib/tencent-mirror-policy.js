// Dedicated identity; never reuse or alter the existing Netlify credential.
export const TENCENT_ORIGIN='https://nsp-wiki.shiaoming.cn';
const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const id='[A-Za-z0-9_%.-]{1,160}';
const rules=[
  ['GET','/api/analytics/summary'],['POST','/api/analytics/event'],
  ['GET|PUT','/api/site-notice'],
  ['GET','/api/auth/session'],['POST','/api/auth/(?:login|register|logout)'],
  ['GET|POST','/api/posts'],
  ['GET|POST',`/api/posts/${uuid}/comments`],['PUT',`/api/posts/${uuid}/like`],
  ['GET',`/api/images/${uuid}`],
  ['GET',`/api/(?:items|affixes)/${id}`],
  ['GET|POST',`/api/(?:items|affixes)/${id}/comments`],
  ['PUT',`/api/(?:items|affixes)/${id}/like`],
  ['PUT',`/api/(?:item|affix)-comments/${uuid}/like`],
  ['GET|POST','/api/feedback'],
  ['GET|DELETE',`/api/feedback/${uuid}`],
  ['GET|POST',`/api/feedback/${uuid}/comments`],['PUT',`/api/feedback/${uuid}/like`],
  ['DELETE',`/api/feedback-comments/${uuid}`],
  ['GET','/api/admin/(?:posts|comments|item-comments|affix-comments|feedback|overview|members|audit|content|feedback-comments|feedback-workflow)'],
  ['PUT',`/api/admin/members/${uuid}/(?:permissions|restriction)`],
  ['PUT',`/api/admin/feedback-workflow/${uuid}`],
  ['GET',`/api/admin/(?:members|feedback-workflow)/${uuid}`],
  ['GET|PATCH|DELETE',`/api/posts/${uuid}`],
  ['DELETE',`/api/(?:comments|item-comments|affix-comments)/${uuid}`],
].map(([methods,path])=>[methods.split('|'),new RegExp('^'+path+'$')]);
export function allowedTencent(method,path){
  let decoded;
  try {decoded=decodeURIComponent(path);} catch{return false;}
  if(/[\\?#%\x00-\x1f\x7f]/.test(decoded)||decoded.split('/').length!==path.split('/').length||decoded.split('/').some(x=>x==='.'||x==='..'))return false;
  return rules.some(([methods,pathRegex])=>methods.includes(method)&&pathRegex.test(path));
}
