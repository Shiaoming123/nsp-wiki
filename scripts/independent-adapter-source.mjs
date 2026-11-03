import {readFileSync} from 'node:fs';
import path from 'node:path';
export function adapterSource(folder,release){
  if(typeof release!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(release))throw Error('A valid release identity is required');
  const source=readFileSync(path.join(folder,'independent.mjs'),'utf8'),old='export const BODY_LIMIT=5*1024*1024+65536;',identity="release:'20261017-independent-v1'";
  if(source.split(old).length!==2)throw Error('Independent adapter source changed; inspect its upload boundary');
  if(source.split(identity).length!==2)throw Error('Independent adapter source changed; inspect its health identity');
  return source.replace(old,'export const BODY_LIMIT=5*1024*1024+128*1024;').replace(identity,'release:'+JSON.stringify(release));
}
