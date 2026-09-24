const building=`pnu 대지위치 시군구코드명 법정동코드명 대지구분코드명 주지번 부지번 특수지명 블록번호 로트번호 새주소도로코드명 새주소법정동코드명 새주소지상지하구분코드명 새주소주지번 새주소부지번 건축물대장일련번호 대장구분코드명 대장종류코드명 동명 주부속구분코드명 대지면적 건축면적 건폐율 연면적 용적률산정연면적 용적률 구조코드명 기타구조정보 주용도코드 주용도코드명 기타용도내용 지붕코드명 기타지붕명 세대수 가구수 호수 지상층수 지하층수 높이 승용승강기수 비상용승강기수 주건축물수 부속건축물수 부속건축물면적 총동연면적 총주차수 옥내기계식대수 옥내기계식면적 옥외기계식대수 옥외기계식면적 옥내자주식대수 옥내자주식면적 옥외자주식대수 옥외자주식면적 허가일자 착공일자 사용승인일자 에너지효율등급값 에너지절감률 epi점수 친환경건축물등급값 친환경건축물인증점수 지능형건축물등급값 지능형건축물인증점수 내진설계적용여부 내진능력내용 imported_at`.split(' ');
const land=`pnu 법정동코드 법정동명 지번 대장구분코드 대장구분명 지목코드 지목명 면적 소유구분코드 소유구분명 소유(공유)인수 축척구분코드 축척구분명 데이터기준일자 원천시도시군구코드 source_snapshot_date imported_at`.split(' ');
export function sanitizeRecordFields(raw,kind='building') {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return [];
  return (kind==='land'?land:building).flatMap(key=>{
    const value=raw[key];
    if(value===null||value===undefined||!['string','number','boolean'].includes(typeof value)||String(value).trim()==='')return [];
    return [{key,value:String(value).trim().slice(0,2000)}];
  });
}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pnu:'필지번호(PNU)',source_snapshot_date:'원천 파일 기준일',imported_at:'자료 적재일',epi점수:'에너지성능지표(EPI) 점수'};
function group(key){
  if(/주차|기계식|자주식|승강기/.test(key))return '주차·승강기';
  if(/에너지|epi|친환경|지능형|내진/.test(key))return '성능·인증·내진';
  if(/일자|기준일|snapshot|imported/.test(key))return '일자·자료 기준';
  if(/면적|건폐율|용적률|높이|층수|세대수|가구수|호수|건축물수/.test(key))return '면적·규모';
  if(/용도|구조|지붕/.test(key))return '용도·구조';
  return '기본 정보';
}
function format({key,value}){
  if(/일자$/.test(key)&&/^\d{8}$/.test(value))return value.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  const unit=/면적$/.test(key)?'㎡':/건폐율|^용적률$|에너지절감률/.test(key)?'%':key==='높이'?'m':/층수$/.test(key)?'층':/대수$|승강기수$|총주차수/.test(key)?'대':/건축물수$/.test(key)?'동':key==='소유(공유)인수'?'명':'';
  return unit&&/^\d+(?:\.\d+)?$/.test(value)?`${Number(value).toLocaleString('ko-KR',{maximumFractionDigits:5})} ${unit}`:value;
}
export function renderRecordFields(fields){
  const groups=new Map();
  for(const f of fields||[]){const name=group(f.key);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(f);}
  return [...groups].map(([name,items])=>`<section class="record-field-group"><h5>${name}</h5><dl class="register-fields">${items.map(f=>`<div><dt>${esc(labels[f.key]||f.key)}</dt><dd>${esc(format(f))}</dd></div>`).join('')}</dl></section>`).join('');
}
