import { execFile } from 'node:child_process';
import { join } from 'node:path';

const cache = new Map();
const cacheTtl = { list: 300000, sources: 300000 };
function getCached(operation) {
  const hit = cache.get(operation), ttl = cacheTtl[operation] || 0;
  return hit && Date.now() - hit.at < ttl ? hit.value : null;
}
function setCached(operation, value) {
  if (cacheTtl[operation]) cache.set(operation, { at: Date.now(), value });
}
function clearCached() { cache.clear(); }

export function allowedReviewWrite(request) {
  return request.method==='POST' && /^application\/json(?:\s*;|$)/i.test(request.headers['content-type']||'') &&
    request.headers.origin===`http://${request.headers.host}` &&
    !['cross-site','none'].includes(request.headers['sec-fetch-site']);
}
export function runCuration(root,operation,input) {
  if (input===undefined) {
    const cached = getCached(operation);
    if (cached) return Promise.resolve(cached);
  }
  return new Promise((resolve,reject)=>{
    const child=execFile(process.env.TEOJABI_PYTHON||'C:/Users/yoon/AppData/Local/Programs/Python/Python310/python.exe',
      ['-X','utf8',join(root,'automation/curation.py'),operation],
      {windowsHide:true,timeout:180000,maxBuffer:96*1024*1024,encoding:'utf8'},(error,stdout)=>{
        try {
          const result=JSON.parse(stdout);
          if(error&&result.status!=='invalid')reject(new Error('LOCAL_REVIEW_UNAVAILABLE'));
          else { if(input!==undefined) clearCached(); else setCached(operation,result); resolve(result); }
        }
        catch {reject(new Error('LOCAL_REVIEW_UNAVAILABLE'));}
      });
    child.stdin.on('error',()=>{});
    child.stdin.end(input===undefined?'':JSON.stringify(input));
  });
}
export async function readReviewBody(request) {
  const chunks=[];let bytes=0;
  for await(const chunk of request){bytes+=chunk.length;if(bytes>256000)throw new Error('BODY_LIMIT');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
