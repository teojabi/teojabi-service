// Public deployment configuration contains origins only, never keys or passwords.
import { DATA_API_BASE } from './runtime-config.mjs';
export function apiUrl(path, base=DATA_API_BASE) {
  if (!path.startsWith('/api/')) return path;
  if (!base) return path;
  const url=new URL(base);
  if (url.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:')) throw new Error('Invalid API origin');
  if(url.username||url.password||url.search||url.hash)throw new Error('Invalid API origin');
  return base.replace(/\/$/,'')+path;
}
export function apiFetch(path,options={}) {
  return fetch(apiUrl(path),{...options,credentials:'include',signal:options.signal||AbortSignal.timeout(options.method==='POST'?180000:30000)});
}
