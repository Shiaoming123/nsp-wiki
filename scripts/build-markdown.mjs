import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['lib/post-markdown.js'],outfile:'public/vendor/post-markdown.js',bundle:true,minify:true,format:'iife',platform:'browser',target:'es2022',legalComments:'eof'});
// The independent API has no npm Markdown dependency: ship the same pinned grammar bundled.
await build({entryPoints:['lib/article-markdown.js'],outfile:'lib/vendor/article-markdown.js',bundle:true,minify:true,format:'esm',platform:'neutral',target:'es2022',legalComments:'eof'});
writeFileSync('public/vendor/post-markdown.LICENSE.txt',['marked','dompurify'].map(name=>name+'\n\n'+readFileSync('node_modules/'+name+'/LICENSE','utf8')).join('\n\n'));
