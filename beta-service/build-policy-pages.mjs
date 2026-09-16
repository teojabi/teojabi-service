import {readFile,writeFile} from 'node:fs/promises';

// Policy copy and generated pages travel with the beta. The legacy site is not
// read at build time or runtime; index.html supplies the shared business footer.
const root=new URL('./',import.meta.url);
const policies=JSON.parse(await readFile(new URL('policy-content.json',root),'utf8'));
const index=await readFile(new URL('index.html',root),'utf8');
const footer=index.match(/<footer class="service-footer">[\s\S]*?<\/footer>/)?.[0];
if(!footer)throw new Error('Shared footer missing');
const pages=[
  {id:'terms',label:'이용약관',description:'터잡이 이용에 필요한 권리와 의무, 서비스 운영 기준을 안내합니다.',tag:'서비스 이용 기준'},
  {id:'privacy',label:'개인정보처리방침',description:'어떤 정보를 수집하고, 어떻게 이용·보관·보호하는지 안내합니다.',tag:'개인정보 보호'},
  {id:'paid-service',label:'구독서비스',description:'지금 이용할 수 있는 기능과 앞으로의 구독서비스를 안내합니다.',tag:'베타 서비스 안내'},
  {id:'refund',label:'환불정책',description:'유료서비스의 청약 철회, 환불 기준과 신청 절차를 안내합니다.',tag:'결제·환불 안내'},
  {id:'business-info',label:'사업자정보',description:'터잡이의 서비스 운영사와 고객센터 정보를 확인하세요.',tag:'터잡이 소개'},
];
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const contact=`<div class="guide-contact"><span class="guide-mini">도움이 필요하신가요?</span><h3>터잡이에 문의하세요</h3><p>정책과 서비스 이용에 관해<br>궁금한 점을 남겨주세요.</p><a href="mailto:teojabi@gmail.com">teojabi@gmail.com</a><span>070-8919-4609</span><a class="guide-contact-link" href="https://pf.kakao.com/_qSQxhX/chat" target="_blank" rel="noopener noreferrer">카카오톡 문의 ↗</a></div>`;
const infoRows=rows=>`<dl class="guide-info">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
function subscription(){
 return {toc:[['beta','베타에서 이용하기'],['subscription','구독서비스 안내'],['subscription-questions','궁금한 점']],body:`
 <section class="guide-beta-panel" id="beta"><span class="guide-status"><i></i> BETA</span><h2>먼저 둘러보고,<br>나에게 맞는 공간을 찾아보세요.</h2><p>조건에 맞는 매물을 찾고, 주변 거래와 토지 정보를 함께 살펴볼 수 있어요.</p><a class="primary guide-button" href="./index.html#search">매물 둘러보기 <span aria-hidden="true">↗</span></a></section>
 <div class="guide-feature-grid"><article><span class="guide-feature-number">01</span><h3>내 조건으로 매물 찾기</h3><p>목적·예산·지역·대지면적과 용도지역으로 찾고, 결과에서 조건을 바로 바꿔보세요.</p></article><article><span class="guide-feature-number">02</span><h3>주변 실거래 함께 보기</h3><p>가까운 거래 최대 5건을 지도와 상세에서 확인하고, 면적을 ㎡와 평으로 바꿔볼 수 있어요.</p></article><article><span class="guide-feature-number">03</span><h3>내 건물·토지 살펴보기</h3><p>필지를 선택해 면적·용적률·건폐율을 살펴보고, 구역과 인접도로 정보를 확인하세요.</p></article><article><span class="guide-feature-number">04</span><h3>보유 대장 확인하기</h3><p>건축물대장과 토지대장에 기록된 현황을 매물 상세에서 펼쳐볼 수 있어요.</p></article></div>
 <section class="guide-prose guide-subsection" id="subscription"><h2>구독서비스는 준비 중이에요.</h2><p>베타 페이지에서는 신규 유료 구독 신청과 결제를 받지 않습니다. 구독 요금과 제공 기능, 이용 조건은 서비스가 준비되면 이 페이지에서 안내할 예정입니다.</p><p>기존에 결제한 서비스에 관한 문의는 터잡이 고객센터로 연락해 주세요.</p><div class="guide-related"><a href="./terms.html">이용약관 보기 →</a><a href="./refund.html">환불정책 보기 →</a></div></section>
 <section class="guide-questions" id="subscription-questions"><h2>궁금한 점을 모았어요.</h2><details open><summary>이 페이지에서 구독을 시작할 수 있나요?</summary><p>아직 신규 구독을 신청하는 단계는 아니에요. 준비된 베타 기능을 먼저 둘러보실 수 있습니다.</p></details><details><summary>AI 분석도 사용할 수 있나요?</summary><p>현재 베타에는 AI 대화·분석 기능이 포함되어 있지 않습니다. 직접 선택한 조건과 보유 데이터를 바탕으로 매물과 토지를 살펴보실 수 있어요.</p></details><details><summary>기존 결제·환불은 어디에 문의하나요?</summary><p><a href="./refund.html">환불정책</a>을 확인한 뒤 teojabi@gmail.com 또는 카카오톡 상담 채널로 문의해 주세요.</p></details></section>`};
}
function business(){
 return {toc:[['about','터잡이 소개'],['operator','서비스 운영사'],['support','고객센터']],body:`
 <section class="guide-about" id="about"><span class="guide-mini">공간을 찾는 기준, 터잡이</span><h2>건물을 찾고,<br>내 땅의 가능성을 살펴보는 곳.</h2><p>매물을 찾는 목적부터 주변 거래, 토지와 건축물의 현황까지.<br>터잡이는 공간을 선택할 때 필요한 정보를 한곳에 모읍니다.</p></section>
 <section class="guide-company" id="operator"><div class="guide-company-heading"><span class="guide-feature-number">01</span><div><span class="guide-mini">서비스 운영사</span><h2>터잡이</h2></div></div>${infoRows([['상호','터잡이'],['대표자','방양임'],['사업자등록번호','846-13-02909'],['통신판매업신고','제 2026-경기광주-1091호'],['주소','경기도 광주시 머루숯길 22, C-101'],['고객센터','070-8919-4609'],['이메일','<a href="mailto:teojabi@gmail.com">teojabi@gmail.com</a>']])}<a class="guide-text-link" href="https://www.ftc.go.kr/www/selectBizCommList.do?key=254" target="_blank" rel="noopener noreferrer">공정거래위원회 사업자정보 조회 ↗</a></section>
 <section class="guide-support-panel" id="support"><h2>터잡이와 이야기해 보세요.</h2><p>서비스 이용이나 매물 상담에 관한 문의를 남겨주세요.</p><a class="primary guide-button" href="https://pf.kakao.com/_qSQxhX/chat" target="_blank" rel="noopener noreferrer">카카오톡으로 문의하기 ↗</a></section>`};
}
function legal(page){
 const source=policies[page.id];if(!source?.body)throw new Error(`Policy body missing: ${page.id}`);
 const toc=[];let count=0;
 const body=source.body.replace(/<h3>([\s\S]*?)<\/h3>/g,(_,label)=>{
   if(/^제\s*\d+장/.test(label))return `<p class="guide-chapter">${label}</p>`;
   const id=`${page.id}-${++count}`;toc.push([id,label]);return `<h2 id="${id}">${label}</h2>`;
 });
 return {toc,body:`${page.id==='refund'?'<div class="guide-notice"><b>유료서비스 이용 시 적용되는 정책입니다.</b><p>현재 베타에서는 신규 구독 결제를 받지 않습니다. 기존 결제 건의 환불은 아래 기준과 고객센터를 통해 확인해 주세요.</p></div>':''}<div class="guide-prose">${body}</div>`,date:source.effectiveDate};
}
for(const page of pages){
 const content=page.id==='paid-service'?subscription():page.id==='business-info'?business():legal(page);
 const html=`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#F7F8FA"><meta name="format-detection" content="telephone=no"><meta name="description" content="${esc(page.description)}"><title>${page.label} | 터잡이</title><link rel="canonical" href="https://teojabi.com/${page.id}.html"><meta property="og:type" content="website"><meta property="og:site_name" content="터잡이"><meta property="og:locale" content="ko_KR"><meta property="og:title" content="${page.label} | 터잡이"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="https://teojabi.com/${page.id}.html"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${page.label} | 터잡이"><meta name="twitter:description" content="${esc(page.description)}"><script src="./theme.js"></script><link rel="icon" href="./assets/favicon.ico"><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./theme.css"><link rel="stylesheet" href="./policy-pages.css"></head>
<body class="policy-document"><a class="guide-skip" href="#guide-content">본문 바로가기</a>
<header class="header"><a class="brand" href="./index.html" aria-label="터잡이 시작 화면"><img src="./assets/logo.png" alt="터잡이"><span>BETA</span></a><nav aria-label="주요 메뉴"><a href="./index.html#search">건물 찾기</a><a href="./index.html#analyze">내 건물·토지</a></nav><div class="header-actions"><button id="theme-toggle" type="button" aria-label="다크 모드로 전환" aria-pressed="false">☾ 다크</button></div></header>
<main class="guide-page"><div class="guide-breadcrumb"><a href="./index.html">홈</a><span aria-hidden="true">/</span><span>이용 안내</span></div><div class="guide-hero"><div><span class="eyebrow">TEOJABI GUIDE</span><h1>${page.label}</h1><p>${page.description}</p></div><span class="guide-hero-tag">${page.tag}</span></div>
<nav class="guide-nav" aria-label="이용 정책 및 사업자 안내">${pages.map(p=>`<a href="./${p.id}.html"${p.id===page.id?' aria-current="page"':''}>${p.label}</a>`).join('')}</nav>
<div class="guide-layout"><aside class="guide-sidebar"><nav aria-label="이 페이지의 목차"><span class="guide-mini">이 페이지에서</span>${content.toc.map(([id,label],i)=>`<a href="#${id}"><span>${String(i+1).padStart(2,'0')}</span>${label}</a>`).join('')}</nav>${contact}</aside><article class="guide-article" id="guide-content" tabindex="-1"><div class="guide-article-meta"><span>${page.label}</span>${content.date?`<span>시행일 ${content.date}</span>`:'<span>서비스 안내</span>'}</div>${content.body}<div class="guide-document-end"><span>TEOJABI</span><a href="#guide-content">맨 위로 ↑</a></div></article></div>
<div class="guide-back"><a href="./index.html">← 터잡이 홈으로</a><p>필요한 정보를 확인하고, 내 공간을 계속 살펴보세요.</p></div></main>
${footer}
</body></html>
`;
 await writeFile(new URL(`${page.id}.html`,root),html,'utf8');
 console.log(`Created ${page.id}.html`);
}
