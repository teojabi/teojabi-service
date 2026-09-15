export function reviewText(payload,createdAt=new Date()){
  return ['터잡이 내 땅 검토',payload.name,'작성일 '+createdAt.toLocaleString('ko-KR'),
    '필지: '+payload.pnus.join(', '),...Object.entries(payload.fields).map(([k,v])=>({landArea:'대지면적(㎡)',far:'용적률(%)',bcr:'건폐율(%)',height:'높이(m)'}[k])+': '+(v??'미입력')),
    ...(payload.estimate?[`검토 연면적: ${payload.estimate.floorAreaM2.toFixed(2)}㎡ (${payload.estimate.floorAreaPyeong.toFixed(2)}평)`,`평당 공사비: ${payload.estimate.unitCostManwon.toLocaleString('ko-KR')}만원`,`예상 공사비: ${payload.estimate.constructionWon.toLocaleString('ko-KR')}원`,`설계비(공사비의 5%): ${payload.estimate.designWon.toLocaleString('ko-KR')}원`,'대지면적 × 용적률로 산정한 연면적 기준이며 지하층 등 용적률 제외 면적은 포함하지 않은 개략 공사비입니다.']:[]),
    '메모: '+payload.memo,'입력값으로 정리한 참고 검토이며 허가 가능 규모를 확정하지 않습니다.'].join('\n');
}
export function openReviewExport(payload){
  const text=reviewText(payload),before=document.activeElement,d=document.createElement('dialog');d.className='save-dialog';d.setAttribute('aria-labelledby','export-title');
  const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'}));
  d.innerHTML='<h2 id="export-title">검토 내보내기</h2><label for="export-content">검토 내용</label><textarea id="export-content" rows="12" readonly></textarea><p class="case-note">텍스트 파일로 보관하거나 내용을 복사할 수 있어요.</p><div class="export-actions"><a class="primary" download="터잡이_내땅검토.txt">파일 다운로드</a><button class="outline" data-copy>내용 복사</button><button class="outline" data-close>닫기</button></div><p class="case-note" role="status"></p>';
  d.querySelector('textarea').value=text;d.querySelector('a').href=url;
  d.querySelector('[data-close]').onclick=()=>d.close();
  d.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(text);d.querySelector('[role=status]').textContent='검토 내용을 복사했어요.';}catch{d.querySelector('textarea').select();d.querySelector('[role=status]').textContent='선택된 내용을 복사해 주세요.';}};
  d.addEventListener('close',()=>{URL.revokeObjectURL(url);d.remove();before?.focus();});document.body.append(d);d.showModal();
}
