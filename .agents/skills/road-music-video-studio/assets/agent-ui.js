(()=>{
'use strict';
const boot=window.__STUDIO_BOOTSTRAP__||{},statuses={queued:'대기열 등록됨 · Codex 수신 전',sending:'Codex 대화에 전달하는 중',uncertain:'수신 확인 필요 · 자동 재전송하지 않음',accepted:'Codex가 요청을 수신함',reviewing:'수정 방법을 검토 중',running:'승인된 작업을 진행 중','needs-user-input':'추가 정보가 필요함',succeeded:'작업 완료',failed:'요청 처리 실패'},terminals=new Set(['succeeded','failed','needs-user-input']);
const text=v=>typeof v==='string'?v:'',clip=v=>text(v).slice(0,12000),canSend=c=>Boolean(c?.connected),isChat=v=>v?.target==='chat',shouldSubmit=(a,s,n)=>!['uncertain','failed'].includes(a?.status)&&!(s===n&&a?.requestId),uncertainAfterTransportFailure=(d,m)=>/응답 시간이 초과|제작실에 연결할 수 없습니다/.test(text(m))&&d?.requestId?{...d,status:'uncertain'}:d;
const requestId=()=>{if(!globalThis.crypto?.getRandomValues)throw Error('안전한 요청 ID를 만들 수 없습니다. 페이지를 새로 고친 뒤 다시 시도하세요.');return [...crypto.getRandomValues(new Uint8Array(24))].map(x=>x.toString(16).padStart(2,'0')).join('')},fingerprint=v=>JSON.stringify([v.target,v.intent,v.prompt,v.preserve,v.revisedLyrics,v.mediaId,v.mediaSha256,v.range]);
const requestText=(p,v)=>isChat(v)?['[Road Music 대화·질문]',`프로젝트: ${p?.projectName||p?.projectId||'미확인'}`,`프로젝트 ID: ${p?.projectId||''}`,'의도: 검토와 답변만','',`메시지:\n${v.prompt}`,'','이 대화 요청은 음원 생성·설치·파일 변경을 지시하지 않습니다.'].join('\n'):['[Road Music 요청]',`프로젝트: ${p?.projectName||p?.projectId||'미확인'}`,`프로젝트 ID: ${p?.projectId||''}`,`대상: ${v.target}`,`의도: ${v.intent}`,`기준 버전: ${v.baseVersionId||p?.baseVersionId||''}`,`미디어 ID: ${v.mediaId||'없음'}`,`미디어 SHA-256: ${v.mediaSha256||'없음'}`,v.range?`검토 구간: ${v.range.start}초 ~ ${v.range.end}초`:'검토 구간: 미지정','',`요청:\n${v.prompt}`,`보존 조건:\n${v.preserve||'없음'}`,...(v.revisedLyrics?[`수정 가사:\n${v.revisedLyrics}`]:[])].join('\n');
const query=(path,params={})=>{const url=new URL(path,location.origin);url.searchParams.set('token',boot.token||'');for(const [k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));return url.pathname+'?'+url.searchParams.toString()};
async function agentFetch(path,options={},params={}){let response,data;try{response=await fetch(query(path,params),{signal:AbortSignal.timeout(30000),...options});data=await response.json()}catch(error){if(['AbortError','TimeoutError'].includes(error?.name))throw Error('응답 시간이 초과되었습니다. 같은 요청 ID로 상태를 확인하세요.');if(error?.name==='TypeError')throw Error('제작실에 연결할 수 없습니다. 입력은 그대로 보존했습니다.');throw error}if(!response.ok)throw Error(text(data?.error)||'Codex 요청을 처리하지 못했습니다.');return data}
function el(name,options={},children=[]){const node=document.createElement(name);Object.assign(node,options);for(const child of children)node.append(child);return node}function line(label,control){const node=el('label',{textContent:label});node.append(control);return node}
function safeRange(start,end){const l=String(start).trim(),r=String(end).trim();if(!l&&!r)return null;const a=Number(l),b=Number(r);if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a)throw Error('구간은 0 이상이며 끝 시각이 시작 시각보다 커야 합니다.');return {start:a,end:b}}
function contextProject(context,id){const projects=context?.projects||[];return id?projects.find(p=>p.projectId===id)||null:projects[0]||null}function draftKey(scope,id){return `road-music-agent-draft:${boot.token||'unknown'}:${scope}:${id||'none'}`}function readDraft(scope,id){try{const x=JSON.parse(sessionStorage.getItem(draftKey(scope,id)));return x&&typeof x==='object'?x:{}}catch{return {}}}function writeDraft(scope,id,value){try{sessionStorage.setItem(draftKey(scope,id),JSON.stringify(value))}catch{}}
function statusLabel(status,intent){return status==='succeeded'&&intent==='review'?'검토 완료(음원·영상 변경 아님)':statuses[status]||'상태를 확인하는 중'}function makeFallback(root,value,label='Codex 원문'){let node=root.querySelector('[data-agent-copy-fallback]');if(!node){node=el('textarea',{className:'copy-fallback',readOnly:true,hidden:true,ariaLabel:label});node.dataset.agentCopyFallback='';root.append(node)}node.hidden=false;node.value=value;node.focus();node.select()}
function currentPlayer(media){if(!media?.url)return null;const wanted=new URL(media.url,location.href).href;return [...document.querySelectorAll('audio,video')].find(p=>{try{return new URL(p.currentSrc||p.src,location.href).href===wanted}catch{return false}})||null}
function historyTurns(turns){return (turns||[]).filter(t=>t&&typeof t.id==='string').map(t=>({...t,messages:(t.messages||[]).filter(m=>['user','assistant'].includes(m?.role)&&typeof m.text==='string')}))}
function formatTime(s){if(!Number.isFinite(s))return '저장 시각 미확인';try{return new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Seoul'}).format(new Date(s*1000))}catch{return '저장 시각 미확인'}}
function formatFetchedAt(value){const date=new Date(value);return Number.isNaN(date.valueOf())?'시각 미확인':new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Seoul'}).format(date)}
function phaseLabel(p){return ({commentary:'진행',partial_answer:'중간 답변',final_answer:'답변 완료'})[p]||'저장된 메시지'}
function hasPendingRequests(requests){return (requests||[]).some(request=>!terminals.has(request?.status))}
function isCurrentRequestSnapshot(activeRequestId,expectedRequestId){return (activeRequestId||null)===(expectedRequestId||null)}
function attachmentCount(value){return Array.isArray(value)?value.length:Number.isInteger(value)&&value>0?value:0}
function outboundValue(raw){return isChat(raw)?{...raw,intent:'review',revisedLyrics:'',mediaId:undefined,mediaSha256:undefined,range:null}:raw}
function renewCompletedDraft(draft,nextRequestId){return draft?.status==='succeeded'?{...draft,requestId:nextRequestId,status:'',previousRequestId:draft.requestId||draft.previousRequestId||'',target:'chat',intent:'review',prompt:''}:draft||{}}
function mount(root){
 const scope=root.dataset.agentScope==='detail'?'detail':'studio';
 let context,project,activeRequest,requestPoll,historyPoll,historyLoading=false,historyCursor,historyAbort,historyVersion='',projectEpoch=0,historyEpoch=0,submittedFingerprint='',recentProjectId='',submitting=false,projectSwitching=false,draft={},turns=new Map(),draftRevision=0,draftServerReady=false,draftSaveTimer,draftWrite=Promise.resolve(),draftMediaStale=false;
 const heading=el('h3',{textContent:'Codex 대화와 작업 요청'}),intro=el('p',{className:'hint',textContent:'현재 대화에 질문하거나 음악·가사·영상 요청을 보냅니다. 저장된 사용자 요청과 공개 Codex 답변 전문은 아래 이력에서 확인합니다.'}),state=el('p',{className:'hint',role:'status',textContent:'Codex 연결을 확인하는 중…'}),draftState=el('p',{className:'hint',role:'status',textContent:'초안을 불러오는 중…'}),connection=el('aside',{className:'rm-callout rm-callout--note'}),projectSelect=el('select',{ariaLabel:'요청할 프로젝트'}),target=el('select',{ariaLabel:'요청 대상'}),intent=el('select',{ariaLabel:'요청 종류'}),mediaSelect=el('select',{ariaLabel:'확인한 미디어'}),prompt=el('textarea',{rows:5,maxLength:12000,autocomplete:'off'}),preserve=el('textarea',{rows:3,maxLength:4000,autocomplete:'off'}),originalLyrics=el('textarea',{rows:6,readOnly:true,ariaLabel:'등록된 원가사'}),revisedLyrics=el('textarea',{rows:6,maxLength:20000,autocomplete:'off'}),diff=el('ol',{className:'agent-lyrics-diff',ariaLabel:'가사 변경 비교'}),start=el('input',{type:'number',min:'0',step:'0.01',inputMode:'decimal',ariaLabel:'수정 구간 시작 초'}),end=el('input',{type:'number',min:'0',step:'0.01',inputMode:'decimal',ariaLabel:'수정 구간 끝 초'}),useStart=el('button',{type:'button',className:'secondary',textContent:'현재 시각을 시작으로'}),useEnd=el('button',{type:'button',className:'secondary',textContent:'현재 시각을 끝으로'}),rangeNote=el('p',{className:'hint'}),send=el('button',{type:'button',textContent:'Codex에 요청 보내기',disabled:true}),check=el('button',{type:'button',className:'secondary',textContent:'상태 확인',disabled:true}),newRequest=el('button',{type:'button',className:'secondary',textContent:'새 요청 작성',disabled:true}),copy=el('button',{type:'button',className:'secondary',textContent:'요청문 복사'}),status=el('p',{className:'hint',role:'status'});
 [['chat','대화·질문'],['music','음원 보완'],['lyrics','가사 수정'],['video','영상 제작·수정']].forEach(([v,l])=>target.append(el('option',{value:v,textContent:l})));[['review','검토와 제안만'],['produce','제작 진행']].forEach(([v,l])=>intent.append(el('option',{value:v,textContent:l})));
 const mediaLine=line('확인한 음원·영상',mediaSelect),intentLine=line('요청 방식',intent),preserveLine=line('보존 조건',preserve),form=el('div',{className:'studio-agent-fields'},[line('프로젝트',projectSelect),line('대상',target),intentLine,mediaLine,line('Codex에 보낼 내용',prompt),preserveLine]),lyricsBox=el('details',{},[el('summary',{textContent:'원가사와 수정 가사'}),line('등록된 원가사',originalLyrics),line('수정 가사',revisedLyrics),el('p',{className:'hint',textContent:'가사 변경 비교는 줄 단위 참고용입니다. 승인 원문은 읽기 전용으로 보존합니다.'}),diff]),rangeBox=el('details',{},[el('summary',{textContent:'확인한 구간 지정'}),line('시작 (초)',start),line('끝 (초)',end),el('div',{className:'actions'},[useStart,useEnd]),rangeNote]),limitation=el('aside',{className:'rm-callout rm-callout--warning'},[el('div',{className:'rm-callout-heading'},[el('strong',{textContent:'YuE 수정 범위'})]),el('p',{textContent:'YuE는 요청을 검토해 전곡 재생성·가사·편성·악보 수정 가능 여부를 판단합니다. 특정 구간 밖의 원음을 그대로 보존하는 부분 파형 교체는 지원하지 않습니다.'})]),actions=el('div',{className:'actions'},[send,check,newRequest,copy]),historyMeta=el('p',{className:'hint',role:'status',textContent:'저장된 대화를 불러오는 중…'}),refreshHistoryButton=el('button',{type:'button',className:'secondary',textContent:'최신 확인'}),moreHistory=el('button',{type:'button',className:'secondary',textContent:'이전 대화 더 보기',hidden:true}),requestFeed=el('div',{className:'studio-agent-request-feed',ariaLabel:'이 대화에서 보낸 작업 요청'}),historyFeed=el('div',{className:'studio-agent-history',ariaLive:'polite'}),historySection=el('section',{className:'studio-agent-history-section','aria-labelledby':'studioAgentHistoryTitle'},[el('div',{className:'section-heading'},[el('div',{id:'studioAgentHistoryTitle'},[el('h4',{textContent:'저장된 Codex 대화 이력'}),el('p',{className:'hint',textContent:'이 대화 전체의 저장된 사용자 메시지와 공개 Codex 답변입니다. 토큰 실시간 스트리밍이 아니며 저장 반영이 늦을 수 있습니다.'})]),refreshHistoryButton]),historyMeta,moreHistory,requestFeed,historyFeed]);
 heading.textContent='음원·가사·영상 수정 요청';
 intro.textContent='수정할 대상을 고른 뒤 원하는 변경을 입력하세요. 같은 Codex 대화에서 검토하거나 승인한 작업을 이어갑니다.';
 prompt.ariaLabel='수정 요청 내용';
 const promptLine=line('수정 요청 내용',prompt);
 promptLine.className='studio-agent-prompt';
 form.replaceChildren(line('수정할 대상',target),intentLine,promptLine,line('프로젝트',projectSelect),mediaLine,preserveLine);
 const historyLink=el('a',{href:'#studioAgentHistory',className:'text-link',textContent:'답변·대화 이력 보기'}),head=el('div',{className:'studio-agent-heading'},[heading,historyLink]),launcher=el('button',{type:'button',className:'studio-agent-launcher',textContent:'수정 요청 입력'});
 connection.className+=' studio-agent-connection';
 historySection.id='studioAgentHistory';
 root.replaceChildren(head,intro,form,lyricsBox,rangeBox,limitation,actions,connection,state,draftState,status,launcher);
 (document.getElementById('studioAgentHistoryHost')||root).append(historySection);
 function openComposer(nextTarget){
  if(submitting||projectSwitching)return;
  if(['music','lyrics','video'].includes(nextTarget)){target.value=nextTarget;changed();if(nextTarget==='lyrics')lyricsBox.open=true;}
  root.scrollIntoView({block:'start',behavior:'auto'});
  prompt.scrollIntoView({block:'center',behavior:'auto'});
  prompt.focus({preventScroll:true});
 }
 launcher.addEventListener('click',()=>openComposer());
 document.querySelectorAll('[data-agent-open], [data-agent-target]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();openComposer(button.dataset.agentTarget)}));
 const selectedMedia=()=>project?.media?.find(x=>x.id===mediaSelect.value)||null;
 function draftValues(){const mediaId=draftMediaStale?draft.mediaId:(mediaSelect.value||undefined),mediaSha256=draftMediaStale?draft.mediaSha256:selectedMedia()?.sha256;return {target:target.value,intent:intent.value,prompt:clip(prompt.value),preserve:text(preserve.value).slice(0,4000),revisedLyrics:text(revisedLyrics.value).slice(0,20000),mediaId,mediaSha256,rangeStart:text(start.value),rangeEnd:text(end.value)}}
 function values(){const {rangeStart,rangeEnd,...raw}=draftValues();if(!isChat(raw)&&draftMediaStale)throw Error('저장된 초안의 선택 미디어가 바뀌었습니다. 현재 미디어를 다시 선택한 뒤 요청하세요.');return outboundValue({...raw,range:isChat(raw)?null:safeRange(rangeStart,rangeEnd)})}
 function storedDraft(){let value;try{value=draftValues()}catch{return null}return {...value,baseVersionId:project?.baseVersionId||undefined,requestId:draft.requestId||'',status:draft.status||'',submittedFingerprint,previousRequestId:draft.previousRequestId||''}}
 function hasDraft(value){return Boolean(value&&(value.prompt||value.preserve||value.revisedLyrics||value.mediaId||value.rangeStart||value.rangeEnd||value.requestId||value.status))}
 function saveServerDraft(revision,value,projectId){draftWrite=draftWrite.catch(()=>true).then(async()=>{if(project?.projectId===projectId&&revision===draftRevision)draftState.textContent='초안 저장 중…';try{await agentFetch('/api/agent/draft',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':boot.token||''},body:JSON.stringify({projectId,...(scope==='detail'?{groupId:boot.groupId}:{}),scope,draft:value})});if(project?.projectId===projectId&&revision===draftRevision)draftState.textContent='초안 저장됨';return true}catch(error){if(project?.projectId===projectId&&revision===draftRevision)draftState.textContent=`초안 저장 실패 · ${error.message}`;return false}});return draftWrite}
 function persist(critical=false){if(!project)return Promise.resolve(true);const projectId=project.projectId,value=storedDraft();if(!value)return Promise.resolve(true);writeDraft(scope,projectId,value);const revision=++draftRevision;if(!draftServerReady)return Promise.resolve(!critical);if(critical){clearTimeout(draftSaveTimer);return saveServerDraft(revision,value,projectId)}clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(()=>saveServerDraft(revision,value,projectId),400);return Promise.resolve(true)}
 function renderDiff(){diff.replaceChildren();const a=originalLyrics.value.split('\n'),b=revisedLyrics.value.split('\n');if(!revisedLyrics.value.trim())return;for(let i=0,n=Math.max(a.length,b.length);i<n;i++)if(a[i]!==b[i])diff.append(el('li',{textContent:`${i+1}행: ${a[i]||'∅'} → ${b[i]||'∅'}`}));if(!diff.childElementCount)diff.append(el('li',{textContent:'원문과 같은 가사입니다.'}))}
 function renderMedia(){const media=(project?.media||[]).filter(x=>['music','video'].includes(x.kind)),saved=media.find(x=>x.id===draft.mediaId);draftMediaStale=Boolean(draft.mediaId&&(!saved||(draft.mediaSha256&&saved.sha256!==draft.mediaSha256)));mediaSelect.replaceChildren(el('option',{value:'',textContent:'미디어를 선택하지 않음'}));for(const x of media)mediaSelect.append(el('option',{value:x.id,textContent:`${x.kind==='music'?(x.id==='music'?'원음':'음원'):'영상'} · ${x.name||x.id}`}));if(draft.mediaId&&saved&&!draftMediaStale)mediaSelect.value=draft.mediaId;const available=Boolean(selectedMedia());start.disabled=!available;end.disabled=!available;useStart.disabled=!available||!currentPlayer(selectedMedia());useEnd.disabled=!available||!currentPlayer(selectedMedia());rangeNote.textContent=draftMediaStale?'저장된 초안의 선택 미디어가 현재 등록값과 다릅니다. 현재 미디어를 다시 선택해야 요청할 수 있습니다.':available?'구간은 Codex가 검토할 위치입니다. 이 범위만 음원을 교체한다는 뜻은 아닙니다.':'재생 가능한 등록 음원·영상이 없으면 구간을 지정할 수 없습니다.'}
 function updateSend(){send.disabled=!canSend(project?.connection)||submitting||projectSwitching||['uncertain','failed'].includes(draft.status)||(Boolean(activeRequest)&&target.value!=='chat')}function renderTarget(){const chat=target.value==='chat';intent.value=chat?'review':intent.value;intent.disabled=chat;mediaLine.hidden=chat;lyricsBox.hidden=chat;rangeBox.hidden=chat;limitation.hidden=chat||target.value==='video';preserveLine.hidden=chat;prompt.placeholder=({chat:'예: 원본과 v3의 후렴 차이를 어떻게 검토하면 좋을까요? 음원 생성·설치·파일 변경은 하지 마세요.',music:'예: 후렴의 드럼과 베이스를 더 강하게 보완할 수 있는지 검토해 주세요.',lyrics:'예: 둘째 줄을 아래 수정 가사로 바꾸고 싶어요. 가능한 방법을 검토해 주세요.',video:'예: 후렴의 화면 전환을 더 빠르게 하고 가사 자막을 크게 바꿔 주세요.'})[target.value];updateSend()}
 function renderConnection(){const c=project?.connection||{};connection.replaceChildren(el('div',{className:'rm-callout-heading'},[el('strong',{textContent:canSend(c)?'Codex 대화 연결됨':'Codex 대화 연결 안 됨'})]),el('p',{textContent:canSend(c)?'대기열 등록은 수신 확인이 아닙니다. 저장된 대화 이력에서 요청과 답변을 확인하세요.':text(c.reason)||'현재 대화 연결을 확인할 수 없습니다. 요청문은 복사할 수 있습니다.'}));updateSend();if(project?.projectId&&recentProjectId!==project.projectId){recentProjectId=project.projectId;queueMicrotask(()=>{recoverRecent();refreshHistory('latest').catch(()=>{})})}}
 function renderRequestFeed(request){
  const id=request.requestId||request.id;
  if(!id)return;
  let card=requestFeed.querySelector(`[data-request-id="${id}"]`);
  if(!card){card=el('article',{className:'studio-agent-request-card'});card.dataset.requestId=id;requestFeed.append(card)}
  card.replaceChildren(
   el('strong',{textContent:'보낸 작업 요청'}),
   el('p',{className:'hint',textContent:statusLabel(request.status,request.intent||request.payload?.intent)}),
   el('pre',{className:'studio-agent-message-text',textContent:requestText(project,request.payload||request)})
  );
 }
 function stopRequestPoll(){if(requestPoll){clearInterval(requestPoll);requestPoll=null}}
 function startRequestPoll(){if(requestPoll||!project)return;requestPoll=setInterval(()=>{if(!document.hidden)refreshRequests().catch(()=>{})},10000)}
 function renderRequest(request){
  if(!request)return;
  activeRequest=request;
  if(draft.requestId===request.requestId){draft={...draft,status:request.status||draft.status};persist()}
  check.disabled=false;
  newRequest.disabled=false;
  status.textContent=`${statusLabel(request.status,request.intent||request.payload?.intent)}${request.note?` · ${request.note}`:''}`;
  renderRequestFeed(request);
  updateSend();
  if(!terminals.has(request.status))startRequestPoll();
 }
 async function refreshRequests(){
  if(!project)return;
  const captured=project.projectId,activeId=activeRequest?.requestId;
  check.disabled=true;
  try{
   const data=await agentFetch('/api/agent/requests',{}, {projectId:captured,groupId:scope==='detail'?boot.groupId:''});
   if(project?.projectId!==captured||!isCurrentRequestSnapshot(activeRequest?.requestId,activeId))return;
   const requests=data.requests||[];
   for(const request of requests)renderRequestFeed(request);
   const current=activeId&&requests.find(request=>request.requestId===activeId);
   if(current)renderRequest(current);
   else if(activeId)status.textContent='요청 기록을 아직 찾지 못했습니다. 자동 재전송하지 않고 잠시 후 다시 확인하세요.';
   if(hasPendingRequests(requests))startRequestPoll();else stopRequestPoll();
  }catch(error){if(project?.projectId===captured&&isCurrentRequestSnapshot(activeRequest?.requestId,activeId))status.textContent=error.message}
  finally{if(project?.projectId===captured&&isCurrentRequestSnapshot(activeRequest?.requestId,activeId))check.disabled=false}
 }
 async function refreshProjectBeforeSubmit(previous){const fresh=await agentFetch('/api/agent/context',{},scope==='detail'?{groupId:boot.groupId}:{}),next=contextProject(fresh,project?.projectId);if(!next)throw Error('현재 프로젝트를 다시 찾지 못했습니다. 페이지를 새로 고친 뒤 다시 시도하세요.');if(previous){const current=(next.media||[]).find(x=>x.id===previous.id);if(!current||current.sha256!==previous.sha256)throw Error('선택한 미디어가 등록 후 바뀌었습니다. 새 미디어를 확인하고 다시 선택하세요.')}context=fresh;project=next}
 function completedDraft(){return draft.status==='succeeded'}
 function savedFingerprint(value){const raw={target:value?.target||'chat',intent:value?.intent||'review',prompt:text(value?.prompt),preserve:text(value?.preserve),revisedLyrics:text(value?.revisedLyrics),mediaId:value?.mediaId,mediaSha256:value?.mediaSha256};try{return fingerprint(outboundValue({...raw,range:isChat(raw)?null:safeRange(value?.rangeStart??'',value?.rangeEnd??'')}))}catch{return ''}}
 function normalizeCompletedDraft(){if(!completedDraft())return;const current=savedFingerprint(draft);if(draft.submittedFingerprint&&current!==draft.submittedFingerprint){draft={...draft,requestId:requestId(),status:'',previousRequestId:draft.requestId||draft.previousRequestId||'',submittedFingerprint:''};return}draft=renewCompletedDraft(draft,requestId())}
 function safeDraftTarget(){return completedDraft()?'chat':draft.target||'chat'}
 function clearForNew(){if(submitting||projectSwitching)return;const previous=activeRequest?.requestId||draft.requestId||'';stopRequestPoll();activeRequest=null;draft={...draft,requestId:requestId(),status:'',previousRequestId:previous,target:'chat',intent:'review',prompt:''};target.value='chat';intent.value='review';prompt.value='';submittedFingerprint='';status.textContent='새 대화·질문을 작성합니다. 이전 요청 상태는 자동으로 재전송하지 않습니다.';check.disabled=true;newRequest.disabled=true;renderTarget();renderConnection();persist()}
 function changed(){renderDiff();renderMedia();renderTarget();persist()}
 function mediaChanged(){draftMediaStale=false;draft.mediaId=mediaSelect.value||undefined;draft.mediaSha256=selectedMedia()?.sha256;changed()}
 function historyStamp(){return JSON.stringify([...turns.values()].sort((a,b)=>(a.startedAt||0)-(b.startedAt||0)).map(turn=>[turn.id,turn.status,turn.messages.map(message=>[message.id,message.role,message.phase,message.text])]))}
 function renderHistory(followLatest=false){
  const stamp=historyStamp();
  if(stamp===historyVersion)return;
  const atBottom=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-40;
  const anchor=historyFeed.firstElementChild;
  const anchorTop=anchor?.getBoundingClientRect?.().top;
  const list=[...turns.values()].sort((a,b)=>(a.startedAt||0)-(b.startedAt||0));
  historyFeed.replaceChildren();
  for(const turn of list){
   const entry=el('article',{className:'studio-agent-turn'});entry.dataset.turnId=turn.id;
   entry.append(el('p',{className:'studio-agent-turn-meta',textContent:`${formatTime(turn.startedAt)} · ${turn.status||'상태 미확인'}`}));
   for(const message of turn.messages){
    const card=el('article',{className:`studio-agent-message studio-agent-message--${message.role}`});
    const head=el('div',{className:'studio-agent-message-head'},[el('strong',{textContent:message.role==='user'?'사용자':'Codex'}),el('span',{textContent:phaseLabel(message.phase)})]);
    const button=el('button',{type:'button',className:'secondary studio-agent-message-copy',textContent:'원문 복사'});
    button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(message.text);historyMeta.textContent='원문을 복사했습니다.'}catch{makeFallback(historySection,message.text,'Codex 대화 원문');historyMeta.textContent='자동 복사를 허용하지 않아 원문 전체를 선택했습니다. 직접 복사해 주세요.'}});
    head.append(button);card.append(head,el('pre',{className:'studio-agent-message-text',textContent:message.text}));
    const attachments=attachmentCount(message.attachments);
    if(attachments)card.append(el('p',{className:'hint',textContent:`첨부 ${attachments}개 · 원본 대화에서 확인`}));
    entry.append(card);
   }
   historyFeed.append(entry);
  }
  historyVersion=stamp;
  if(followLatest&&atBottom&&historyFeed.lastElementChild)queueMicrotask(()=>historyFeed.lastElementChild.scrollIntoView({block:'end'}));
  else if(anchor&&Number.isFinite(anchorTop)){const next=historyFeed.querySelector?.(`[data-turn-id="${anchor.dataset.turnId}"]`);const nextTop=next?.getBoundingClientRect?.().top;if(Number.isFinite(nextTop))window.scrollTo({top:window.scrollY+nextTop-anchorTop});}
 }
 function resetHistory(){
  projectEpoch++;
  historyAbort?.abort();
  historyLoading=false;
  historyCursor=null;
  turns=new Map();
  historyVersion='';
  historyFeed.replaceChildren();
  requestFeed.replaceChildren();
  moreHistory.hidden=true;
 }
 async function refreshHistory(mode='latest'){
  if(!project||document.hidden)return;
  const captured=project.projectId,epoch=projectEpoch;
  if(historyLoading&&historyEpoch===epoch)return;
  if(mode==='older'&&!historyCursor)return;
  const controller=new AbortController();
  historyAbort=controller;historyLoading=true;historyEpoch=epoch;refreshHistoryButton.disabled=true;
  try{
   const params={projectId:captured,groupId:scope==='detail'?boot.groupId:'',...(mode==='older'?{cursor:historyCursor}:{limit:5})};
   const data=await agentFetch('/api/agent/history',{signal:controller.signal},params);
   if(epoch!==projectEpoch||project?.projectId!==captured||historyAbort!==controller)return;
   for(const turn of historyTurns(data.turns))turns.set(turn.id,turn);
   if(mode==='older')historyCursor=data.nextCursor||null;
   else if(!historyCursor)historyCursor=data.nextCursor||null;
   moreHistory.hidden=!historyCursor;
   historyMeta.textContent=`저장된 대화 이력 · 새로 확인 ${formatFetchedAt(data.fetchedAt)}`;
   renderHistory(mode==='latest');
  }catch(error){
   if(epoch===projectEpoch&&project?.projectId===captured&&error?.name!=='AbortError')historyMeta.textContent=`저장된 대화를 확인하지 못했습니다. ${error.message}`;
  }finally{
   if(epoch===projectEpoch&&historyAbort===controller){historyLoading=false;refreshHistoryButton.disabled=false;}
  }
 }
 async function moreHistoryEntries(){await refreshHistory('older')}
 function startHistoryPoll(){if(!historyPoll)historyPoll=setInterval(()=>{if(!document.hidden)refreshHistory('latest').catch(()=>{})},2500)}
 function stopHistoryPoll(){if(historyPoll){clearInterval(historyPoll);historyPoll=null}}
 function applyDraft(value){draft=value&&typeof value==='object'?{...value}:{};normalizeCompletedDraft();submittedFingerprint=draft.submittedFingerprint||'';draftMediaStale=false;const populate=()=>{target.value=safeDraftTarget();intent.value=target.value==='chat'?'review':draft.intent||'review';prompt.value=completedDraft()?'':draft.prompt||'';preserve.value=draft.preserve||'';revisedLyrics.value=draft.revisedLyrics||'';start.value=draft.rangeStart??draft.range?.start??'';end.value=draft.rangeEnd??draft.range?.end??''};populate();originalLyrics.value=text(project?.originalLyrics);renderMedia();renderTarget();renderConnection();renderDiff()}
 async function restoreServerDraft(localDraft,revision){const captured=project?.projectId,epoch=projectEpoch;if(!captured)return;draftState.textContent='초안을 불러오는 중…';try{const data=await agentFetch('/api/agent/draft',{}, {projectId:captured,groupId:scope==='detail'?boot.groupId:'',scope});if(epoch!==projectEpoch||project?.projectId!==captured)return;draftServerReady=true;if(hasDraft(localDraft)||draftRevision!==revision){draftState.textContent='이 브라우저에서 작성한 초안을 유지합니다.';if(hasDraft(storedDraft()))persist();return}if(data.draft){applyDraft(data.draft);draftState.textContent='저장된 초안 복원됨';}else draftState.textContent='저장된 초안 없음';}catch(error){if(epoch===projectEpoch&&project?.projectId===captured){draftServerReady=true;draftState.textContent=`초안 저장 실패 · ${error.message}`;if(hasDraft(storedDraft()))persist();}}}
 projectSelect.addEventListener('change',async()=>{const nextId=projectSelect.value,currentId=project?.projectId;if(!project||nextId===currentId||projectSwitching)return;if(submitting){projectSelect.value=currentId;return}projectSwitching=true;const controls=[...root.querySelectorAll('input,select,textarea')];controls.forEach(control=>{control.dataset.agentWasDisabled=String(control.disabled);control.disabled=true});let saved=false;try{saved=await persist(true)}finally{controls.forEach(control=>{control.disabled=control.dataset.agentWasDisabled==='true';delete control.dataset.agentWasDisabled});projectSwitching=false}if(!saved){projectSelect.value=currentId;status.textContent='초안 서버 저장에 실패해 프로젝트 전환을 취소했습니다. 작성 내용은 이 브라우저에 남아 있습니다.';updateSend();return}resetHistory();project=contextProject(context,nextId);draftServerReady=false;const local=readDraft(scope,project?.projectId);const revision=draftRevision;applyDraft(local);activeRequest=null;status.textContent='프로젝트를 바꾸면 해당 프로젝트의 초안을 불러옵니다.';restoreServerDraft(local,revision);refreshHistory('latest').catch(()=>{})});target.addEventListener('change',changed);[intent,prompt,preserve,revisedLyrics,start,end].forEach(x=>x.addEventListener('input',changed));mediaSelect.addEventListener('change',mediaChanged);useStart.addEventListener('click',()=>{const p=currentPlayer(selectedMedia());if(p&&Number.isFinite(p.currentTime)){start.value=p.currentTime.toFixed(2);changed()}});useEnd.addEventListener('click',()=>{const p=currentPlayer(selectedMedia());if(p&&Number.isFinite(p.currentTime)){end.value=p.currentTime.toFixed(2);changed()}});
 async function submitCurrent(){
  let value;
  try{
   value=values();
   if(!value.prompt.trim())throw Error('Codex에 보낼 내용을 입력하세요.');
   if(scope==='studio'&&value.target==='video'&&value.intent==='produce'){
    if(typeof window.roadMusicPrepareAgentRequest!=='function')throw Error('제작 설정을 먼저 저장한 뒤 다시 시도하세요.');
    status.textContent='현재 영상 제작 설정을 저장하는 중…';
    await window.roadMusicPrepareAgentRequest();
   }
   await refreshProjectBeforeSubmit(value.mediaId?selectedMedia():null);
   value=values();
  }catch(error){status.textContent=error.message;return}
  if(!canSend(project?.connection))return;
  const signature=fingerprint(value);
  if(!shouldSubmit(activeRequest,submittedFingerprint,signature)){
   status.textContent=activeRequest?.status==='uncertain'?'수신 확인이 필요한 요청은 자동 재전송하지 않습니다. 상태를 확인하거나 새 요청을 작성하세요.':'같은 요청은 이미 전송했습니다. 상태를 확인하세요.';
   return;
  }
  const id=draft.requestId||requestId(),chat=isChat(value);
  const payload={projectId:project.projectId,...(scope==='detail'?{groupId:boot.groupId}:{}),requestId:id,target:value.target,intent:value.intent,prompt:value.prompt,baseVersionId:project.baseVersionId,...(chat?{}:{preserve:value.preserve,...(value.revisedLyrics?{revisedLyrics:value.revisedLyrics}:{}),...(value.mediaId?{mediaId:value.mediaId,mediaSha256:value.mediaSha256}:{}),...(value.range?{range:value.range}:{})})};
  send.disabled=true;status.textContent='Codex 대화 대기열에 요청을 등록하는 중…';
  try{
   const result=await agentFetch('/api/agent/requests',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':boot.token||''},body:JSON.stringify(payload)}),request=result.request||result;
   submittedFingerprint=signature;
   draft={...draft,requestId:id,status:request.status};
   renderRequest(request);
   if(chat&&request.status!=='uncertain'&&request.status!=='failed'){
    draft={...draft,requestId:requestId(),status:'',previousRequestId:id,prompt:''};
    submittedFingerprint='';prompt.value='';status.textContent='대화 요청을 보냈습니다. 다음 질문을 이어서 작성할 수 있습니다.';updateSend();await persist(true);
   }else await persist(true);
   refreshHistory('latest').catch(()=>{});
  }catch(error){status.textContent=error.message;send.disabled=false;persist()}
 }
 function valuesForCopy(){try{return values()}catch{return {target:target.value,intent:target.value==='chat'?'review':intent.value,prompt:clip(prompt.value),preserve:text(preserve.value).slice(0,4000),revisedLyrics:text(revisedLyrics.value).slice(0,20000),mediaId:mediaSelect.value||undefined,mediaSha256:selectedMedia()?.sha256||undefined,range:null}}}async function copyAllRequest(){const body=requestText(project,valuesForCopy());try{await navigator.clipboard.writeText(body);status.textContent='요청문을 복사했습니다.'}catch{makeFallback(root,body);status.textContent='자동 복사를 허용하지 않아 전체 요청문을 선택했습니다. 직접 복사해 주세요.'}}
 async function recoverRecent(){
  const captured=project?.projectId;
  if(!captured)return;
  try{
   const data=await agentFetch('/api/agent/requests',{}, {projectId:captured,groupId:scope==='detail'?boot.groupId:''});
   if(project?.projectId!==captured)return;
   for(const request of data.requests||[])renderRequestFeed(request);
   const recent=(data.requests||[]).find(request=>!terminals.has(request.status));
   if(recent&&!(draft.requestId&&draft.status)){renderRequest(recent);state.textContent='서버에 남은 이전 요청을 확인했습니다. 작성 중 초안은 바꾸지 않았습니다.'}
  }catch{if(project?.projectId===captured)state.textContent='최근 요청 상태를 확인하지 못했습니다. 작성 중 초안은 유지됩니다.'}
 }
 async function submitStable(){if(submitting||projectSwitching)return;submitting=true;send.disabled=true;const attempt=valuesForCopy();if(attempt.prompt.trim()){draft={...draft,requestId:draft.requestId||requestId(),status:draft.status||''};await persist(true)}const controls=[...root.querySelectorAll('input,select,textarea')];controls.forEach(c=>{c.dataset.agentWasDisabled=String(c.disabled);c.disabled=true});try{await submitCurrent();const recovered=uncertainAfterTransportFailure(draft,status.textContent);if(recovered!==draft&&(!activeRequest||activeRequest.requestId!==recovered.requestId)){draft=recovered;renderRequest({requestId:draft.requestId,status:'uncertain',intent:intent.value,note:'전송 응답을 확인하지 못했습니다. 같은 요청 ID의 상태를 확인하세요.'});persist(true)}}finally{submitting=false;controls.forEach(c=>{c.disabled=c.dataset.agentWasDisabled==='true';delete c.dataset.agentWasDisabled});updateSend()}}
 send.addEventListener('click',submitStable);check.addEventListener('click',refreshRequests);newRequest.addEventListener('click',clearForNew);copy.addEventListener('click',copyAllRequest);refreshHistoryButton.addEventListener('click',()=>refreshHistory('latest'));moreHistory.addEventListener('click',moreHistoryEntries);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHistory('latest').catch(()=>{})});window.addEventListener('pagehide',()=>{persist();stopRequestPoll();stopHistoryPoll()});
 (async()=>{try{const data=await agentFetch('/api/agent/context',{},scope==='detail'?{groupId:boot.groupId}:{});context=data;project=contextProject(context);if(!project)throw Error('요청할 등록 프로젝트가 없습니다.');projectSelect.replaceChildren();for(const item of context.projects||[])projectSelect.append(el('option',{value:item.projectId,textContent:item.projectName||item.projectId}));projectSelect.value=project.projectId;const local=readDraft(scope,project.projectId);applyDraft(local);await restoreServerDraft(local,draftRevision);if(draft.requestId&&draft.status){activeRequest={requestId:draft.requestId,status:draft.status};await refreshRequests()}else state.textContent='대화를 입력하거나 구조화된 작업 요청을 보낼 수 있습니다.';await refreshHistory('latest');startHistoryPoll()}catch(error){state.textContent=`Codex 요청 기능을 준비하지 못했습니다. ${error.message}`;send.disabled=true}})();
}
window.RoadMusicAgentUI={safeRange,statusLabel,fingerprint,requestId,canSend,shouldSubmit,uncertainAfterTransportFailure,draftKey,readDraft,writeDraft,contextProject,requestText,makeFallback,historyTurns,isChat,phaseLabel,formatFetchedAt,outboundValue,isCurrentRequestSnapshot,attachmentCount,renewCompletedDraft};
document.querySelectorAll('#studioAgentComposer').forEach(mount);
})();
