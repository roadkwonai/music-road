import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../assets/agent-ui.js',import.meta.url),'utf8');
const studio=readFileSync(new URL('../assets/studio.html',import.meta.url),'utf8');
const detail=readFileSync(new URL('../assets/work-detail.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/design/design.css',import.meta.url),'utf8');
const storage=new Map();
const context=vm.createContext({
  window:{__STUDIO_BOOTSTRAP__:{token:'agent_test_token'},RoadMusicAgentUI:null},
  document:{querySelectorAll:()=>[],createElement:()=>({dataset:{},focus(){},select(){}})},
  sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
  crypto:{getRandomValues:bytes=>{bytes.fill(7);return bytes}}, Uint8Array, JSON, String, Number, Object, Array, Set, Error, RegExp,
});
vm.runInContext(script,context);
const ui=context.window.RoadMusicAgentUI;

assert.match(studio,/\/agent-ui\.js\?token=__DESIGN_TOKEN__/);
assert.match(studio,/id="studioAgentComposer"/);
assert.match(studio,/roadMusicPrepareAgentRequest/);
assert.match(detail,/\/agent-ui\.js\?token=__DESIGN_TOKEN__/);
assert.match(detail,/data-agent-scope="detail"/);
assert.match(css,/\.studio-agent-composer/);
assert.ok(detail.indexOf('id="studioAgentComposer"')<detail.indexOf('id="workDetail"'));
assert.ok(studio.indexOf('id="studioAgentComposer"')<studio.indexOf('id="music-section"'));
assert.match(detail,/id="studioAgentHistoryHost"/);
for(const target of ['music','lyrics','video'])assert.match(detail,new RegExp('data-agent-target="'+target+'"'));

assert.equal(ui.canSend({connected:false}),false);
assert.equal(ui.canSend({connected:true,transport:'codex-queue'}),true);
assert.match(ui.statusLabel('queued'),/대기열 등록됨/);
assert.match(ui.statusLabel('queued'),/수신 전/);
assert.equal(ui.statusLabel('succeeded','review'),'검토 완료(음원·영상 변경 아님)');
console.log('agent UI VM: disconnected connection disables sending and queued is not received');

assert.equal(ui.shouldSubmit({requestId:'a',status:'uncertain'},'', 'changed'),false);
assert.equal(ui.shouldSubmit({requestId:'a',status:'failed'},'', 'changed'),false);
assert.equal(ui.shouldSubmit({requestId:'a',status:'queued'},'same','same'),false);
assert.equal(ui.shouldSubmit({requestId:'a',status:'queued'},'old','new'),true);
assert.throws(()=>ui.safeRange('x','2'),/구간/);
assert.equal(ui.safeRange('1.25','2.5').start,1.25);
assert.equal(ui.safeRange('1.25','2.5').end,2.5);
let transportMessage='';
await Promise.reject(Object.assign(new Error('offline'),{name:'TypeError'})).catch(error=>{transportMessage=error.name==='TypeError'?'제작실에 연결할 수 없습니다. 입력은 그대로 보존했습니다.':error.message});
const uncertain=ui.uncertainAfterTransportFailure({requestId:'f'.repeat(48),status:''},transportMessage);
assert.equal(uncertain.status,'uncertain');
assert.equal(uncertain.requestId,'f'.repeat(48));
console.log('agent UI VM: uncertain timeout recovery does not resend and invalid ranges are rejected');

const first={projectId:'a'.repeat(64),projectName:'첫 프로젝트'},second={projectId:'b'.repeat(64),projectName:'둘째 프로젝트'};
assert.equal(ui.contextProject({projects:[first,second]},second.projectId),second);
assert.equal(ui.contextProject({projects:[first,second]},'c'.repeat(64)),null);
assert.equal(ui.contextProject({projects:[first,second]}),first);
assert.match(ui.requestText(first,{target:'lyrics',intent:'review',prompt:'<img src=x>',preserve:'원문 보존',revisedLyrics:'새 가사',mediaId:'media-1',mediaSha256:'d'.repeat(64),range:{start:1,end:2}}),/미디어 SHA-256: d{64}/);
assert.match(ui.requestText({...first,baseVersionId:'current-version'},{target:'lyrics',intent:'review',baseVersionId:'saved-version',prompt:'과거 요청',preserve:'원문 보존'}),/기준 버전: saved-version/);
assert.match(ui.formatFetchedAt('2026-10-20T12:00:00Z'),/21:00:00|오후 9:00:00/);
assert.match(script,/refreshProjectBeforeSubmit/);
assert.match(script,/recoverRecent/);
assert.match(script,/completedDraft\(\)/);
assert.match(script,/function draftValues\(\)/);
assert.match(script,/value=draftValues\(\)/);
assert.match(script,/rangeStart:text\(start.value\)/);
assert.match(script,/isCurrentRequestSnapshot\(activeRequest\?\.requestId,activeId\)/);
console.log('agent UI VM: stale project has no fallback, complete clipboard payload, and restart recovery are present');

const id=ui.requestId();
assert.match(id,/^[a-f0-9]{48}$/);
const key=ui.draftKey('detail','a'.repeat(64));
ui.writeDraft('detail','a'.repeat(64),{requestId:id,prompt:'<img src=x onerror=alert(1)>'});
const restored=ui.readDraft('detail','a'.repeat(64));
assert.equal(restored.requestId,id);
assert.equal(restored.prompt,'<img src=x onerror=alert(1)>');
assert.match(key,/agent_test_token/);
assert.match(script,/readOnly:true/);
const copied=ui.requestText(first,{target:'lyrics',intent:'review',prompt:'원본 요청',preserve:'원문 보존',revisedLyrics:'수정 가사',mediaId:'media-1',mediaSha256:'d'.repeat(64),range:{start:1,end:2}});
assert.match(copied,/수정 가사/);
assert.match(copied,/검토 구간: 1초 ~ 2초/);
let fallback;
ui.makeFallback({querySelector:()=>null,append:value=>{fallback=value}},copied);
assert.equal(fallback.value,copied);
assert.doesNotMatch(script,/\.innerHTML/);
console.log('agent UI VM: scoped draft round-trip, readonly lyrics, complete copy fallback, and text-only rendering preserved');

const chat={target:'chat',intent:'produce',prompt:'새 버전 생성 없이 후렴을 비교해 주세요.',preserve:'',mediaId:'music-0',mediaSha256:'d'.repeat(64),range:{start:1,end:2}};
assert.equal(ui.isChat(chat),true);
assert.match(ui.requestText(first,chat),/대화·질문/);
assert.match(ui.requestText(first,chat),/음원 생성·설치·파일 변경을 지시하지 않습니다/);
assert.doesNotMatch(ui.requestText(first,chat),/미디어 SHA-256/);
const hiddenStructuredDraft={...chat,revisedLyrics:'보존할 수정 가사',mediaId:'music-0',mediaSha256:'d'.repeat(64),range:{start:1,end:2}};
const chatOutbound=ui.outboundValue(hiddenStructuredDraft);
assert.equal(hiddenStructuredDraft.revisedLyrics,'보존할 수정 가사');
assert.equal(chatOutbound.revisedLyrics,'');
assert.equal(chatOutbound.mediaId,undefined);
assert.equal(chatOutbound.range,null);
const longMessage='<img src=x onerror=alert(1)>\n'+'가'.repeat(10000);
const turns=ui.historyTurns([{id:'new',startedAt:2,status:'completed',messages:[{id:'u',role:'user',text:longMessage,phase:null},{id:'hidden',role:'tool',text:'숨김'},{id:'a',role:'assistant',text:'응답',phase:'final_answer'}]}]);
assert.equal(turns[0].messages.length,2);
assert.equal(turns[0].messages[0].text,longMessage);
assert.equal(ui.phaseLabel(null),'저장된 메시지');
assert.equal(ui.attachmentCount(1),1);
assert.equal(ui.attachmentCount([{name:'file'}]),1);
assert.equal(ui.isCurrentRequestSnapshot('new','old'),false);
assert.equal(ui.isCurrentRequestSnapshot('new','new'),true);
assert.match(script,/\/api\/agent\/history/);
assert.match(script,/setInterval\(\(\)=>\{if\(!document\.hidden\)refreshHistory/);
assert.match(script,/target:'chat'/);
assert.match(script,/textContent:message\.text/);
assert.match(script,/previousRequestId/);
assert.match(script,/target\.value=safeDraftTarget\(\)/);
console.log('agent UI VM: persisted full-text history is text-only, chat cannot produce, and completed drafts reset to a safe chat');

class FakeNode {
  constructor(name){this.name=name;this.children=[];this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.style={};}
  append(...items){this.children.push(...items);return items.at(-1)}
  replaceChildren(...items){this.children=[...items]}
  addEventListener(name,listener){(this.listeners[name]??=[]).push(listener)}
  querySelector(selector){
    const visit=node=>{
      if(selector==='[data-agent-copy-fallback]'&&Object.hasOwn(node.dataset,'agentCopyFallback'))return node;
      if(selector.startsWith('[data-request-id="')&&node.dataset.requestId===selector.slice(18,-2))return node;
      if(selector.startsWith('[data-turn-id="')&&node.dataset.turnId===selector.slice(15,-2))return node;
      for(const child of node.children||[]){const found=visit(child);if(found)return found}
      return null;
    };
    return visit(this);
  }
  querySelectorAll(){return []}
  focus(){this.focused=true} select(){} scrollIntoView(){this.scrolled=true}
  get firstElementChild(){return this.children[0]||null}
  get lastElementChild(){return this.children.at(-1)||null}
  getBoundingClientRect(){return {top:0}}
}
const composer=new FakeNode('section');composer.dataset.agentScope='studio';
const historyHost=new FakeNode('div');
const editEntries=['music','lyrics','video'].map(target=>{const entry=new FakeNode('a');entry.dataset.agentTarget=target;return entry});
const longReply='<img src=x onerror=alert(1)>\n'+'긴 응답 '.repeat(1600);
const fixtureProject={projectId:'e'.repeat(64),projectName:'모의 프로젝트',baseVersionId:'f'.repeat(64),connection:{connected:true},media:[],originalLyrics:'원가사'};
let requestRows=[
  {requestId:'1'.repeat(48),status:'queued',payload:{target:'chat',intent:'review',prompt:'첫 번째 질문'}},
  {requestId:'2'.repeat(48),status:'queued',payload:{target:'chat',intent:'review',prompt:'두 번째 질문'}},
];
const polls=[];
const fakeDocument={hidden:false,documentElement:{scrollHeight:1},querySelectorAll:selector=>selector==='#studioAgentComposer'?[composer]:selector==='[data-agent-open], [data-agent-target]'?editEntries:[],querySelector:()=>null,getElementById:id=>id==='studioAgentHistoryHost'?historyHost:null,createElement:name=>new FakeNode(name),addEventListener(){}};
const fakeWindow={__STUDIO_BOOTSTRAP__:{token:'fake-token'},RoadMusicAgentUI:null,innerHeight:100,scrollY:0,addEventListener(){},scrollTo(){}};
const fakeFetch=async raw=>{
  const url=new URL(raw,'http://localhost');
  if(url.pathname==='/api/agent/context')return {ok:true,json:async()=>({projects:[fixtureProject]})};
  if(url.pathname==='/api/agent/requests')return {ok:true,json:async()=>({requests:requestRows})};
  if(url.pathname==='/api/agent/history')return {ok:true,json:async()=>({fetchedAt:'2026-10-20T12:00:00Z',nextCursor:null,turns:[{id:'turn-1',startedAt:1,status:'completed',messages:[{id:'message-1',role:'assistant',phase:'final_answer',text:longReply,attachments:1},{id:'tool-1',role:'tool',text:'숨겨야 함'}]}]})};
  throw Error(url.pathname);
};
const mounted=vm.createContext({window:fakeWindow,document:fakeDocument,location:{origin:'http://localhost'},fetch:fakeFetch,sessionStorage:{getItem:()=>null,setItem(){}},navigator:{clipboard:{writeText:async()=>{}}},crypto:{getRandomValues:bytes=>{bytes.fill(9);return bytes}},AbortSignal,AbortController,URL,Intl,queueMicrotask,Uint8Array,JSON,String,Number,Object,Array,Set,Error,RegExp,Promise,setTimeout,clearTimeout,setInterval:callback=>{polls.push(callback);return polls.length},clearInterval:()=>{}});
vm.runInContext(script,mounted);
await new Promise(resolve=>setTimeout(resolve,0));
requestRows=requestRows.map((request,index)=>({...request,status:index===0?'accepted':'reviewing'}));
for(const poll of polls)await poll();
await new Promise(resolve=>setTimeout(resolve,0));
const collect=node=>[node.textContent,...node.children.flatMap(collect)].join('\n');
const mountedText=collect(composer)+'\n'+collect(historyHost);
assert.match(mountedText,/저장된 Codex 대화 이력/);
assert.match(mountedText,/<img src=x onerror=alert\(1\)>/);
assert.doesNotMatch(mountedText,/숨겨야 함/);
assert.match(mountedText,/첨부 1개 · 원본 대화에서 확인/);
assert.match(mountedText,/Codex가 요청을 수신함/);
assert.match(mountedText,/수정 방법을 검토 중/);
console.log('agent UI VM: mounted history is inert and all queued chat request cards refresh together');

const walk=(node,predicate)=>{
  if(predicate(node))return node;
  for(const child of node.children||[]){const found=walk(child,predicate);if(found)return found}
  return null;
};
const entryPrompt=walk(composer,node=>node.name==='textarea'&&node.maxLength===12000);
const entryTarget=walk(composer,node=>node.ariaLabel==='요청 대상');
entryPrompt.value='작성 중인 수정 요청은 그대로 유지합니다.';
for(const entry of editEntries){
  entry.listeners.click[0]({preventDefault(){}});
  assert.equal(entryTarget.value,entry.dataset.agentTarget);
  assert.equal(entryPrompt.value,'작성 중인 수정 요청은 그대로 유지합니다.');
  assert.equal(entryPrompt.focused,true);
  assert.equal(entryPrompt.scrolled,true);
  assert.equal(composer.scrolled,true);
}
assert.equal(walk(composer,node=>node.name==='details'&&node.children[0]?.textContent==='원가사와 수정 가사').open,true);
assert.equal(walk(composer,node=>node.ariaLabel==='요청 종류').value,'review');
walk(composer,node=>node.className==='studio-agent-launcher').listeners.click[0]();
assert.equal(entryTarget.value,'video');
assert.equal(walk(composer,node=>node.className==='studio-agent-history-section'),null);
assert.ok(walk(historyHost,node=>node.className==='studio-agent-history-section'));
console.log('agent UI VM: visible editor and contextual shortcuts focus one draft without sending or granting production approval');
const submitComposer=new FakeNode('section');submitComposer.dataset.agentScope='studio';
const oldRequestId='a'.repeat(48);
const submitKey='road-music-agent-draft:submit-token:studio:'+fixtureProject.projectId;
const submitStorage=new Map([[submitKey,JSON.stringify({requestId:oldRequestId,status:'succeeded',target:'lyrics',intent:'produce',prompt:'이전 제작 요청',revisedLyrics:'보존할 가사',rangeStart:'잘못된 구간'})]]);
let submittedPayload;
let staleResolve;
let delayRequestRead=false;
let submitRows=[{requestId:'b'.repeat(48),status:'queued',payload:{target:'chat',intent:'review',prompt:'이전 대기 질문'}}];
const submitPolls=[];
const submitDocument={...fakeDocument,getElementById:()=>null,querySelectorAll:selector=>selector==='#studioAgentComposer'?[submitComposer]:[]};
const submitFetch=async(raw,options={})=>{
  const url=new URL(raw,'http://localhost');
  if(url.pathname==='/api/agent/context')return {ok:true,json:async()=>({projects:[fixtureProject]})};
  if(url.pathname==='/api/agent/history')return {ok:true,json:async()=>({fetchedAt:'2026-10-20T12:00:00Z',nextCursor:null,turns:[]})};
  if(url.pathname==='/api/agent/requests'&&options.method==='POST'){
    submittedPayload=JSON.parse(options.body);
    const request={requestId:submittedPayload.requestId,status:'accepted',payload:submittedPayload};
    submitRows=[...submitRows,request];
    return {ok:true,json:async()=>({request})};
  }
  if(url.pathname==='/api/agent/requests'&&delayRequestRead)return new Promise(resolve=>{staleResolve=()=>resolve({ok:true,json:async()=>({requests:[{...submitRows[0],status:'failed'}]})})});
  if(url.pathname==='/api/agent/requests')return {ok:true,json:async()=>({requests:submitRows})};
  throw Error(url.pathname);
};
const submitWindow={__STUDIO_BOOTSTRAP__:{token:'submit-token'},RoadMusicAgentUI:null,innerHeight:100,scrollY:0,addEventListener(){},scrollTo(){}};
const submitContext=vm.createContext({window:submitWindow,document:submitDocument,location:{origin:'http://localhost'},fetch:submitFetch,sessionStorage:{getItem:key=>submitStorage.get(key)??null,setItem:(key,value)=>submitStorage.set(key,String(value))},navigator:{clipboard:{writeText:async()=>{}}},crypto:{getRandomValues:bytes=>{bytes.fill(9);return bytes}},AbortSignal,AbortController,URL,Intl,queueMicrotask,Uint8Array,JSON,String,Number,Object,Array,Set,Error,RegExp,Promise,setTimeout,clearTimeout,setInterval:callback=>{submitPolls.push(callback);return submitPolls.length},clearInterval:()=>{}});
vm.runInContext(script,submitContext);
await new Promise(resolve=>setTimeout(resolve,0));
const messageInput=walk(submitComposer,node=>node.name==='textarea'&&node.maxLength===12000);
const sendButton=walk(submitComposer,node=>node.textContent==='Codex에 요청 보내기');
assert.equal(messageInput.value,'');
messageInput.value='새 일반 질문';
delayRequestRead=true;
for(const poll of submitPolls)poll();
await new Promise(resolve=>setTimeout(resolve,0));
await sendButton.listeners.click[0]();
staleResolve?.();
await new Promise(resolve=>setTimeout(resolve,0));
assert.notEqual(submittedPayload.requestId,oldRequestId);
assert.equal(submittedPayload.target,'chat');
assert.equal(submittedPayload.intent,'review');
assert.equal(submittedPayload.range,undefined);
assert.doesNotMatch(collect(submitComposer),/요청 처리 실패/);
console.log('agent UI VM: succeeded draft receives a fresh chat ID and ignores a delayed older request snapshot');

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function draftMount({token,serverDraft,getDraft,postDraft=async()=>({ok:true}),projects}){
  const root=new FakeNode('section');root.dataset.agentScope='detail';
  const history=new FakeNode('div');
  const local=new Map();
  const project={...fixtureProject,media:[{id:'music-0',kind:'music',name:'원음',sha256:'a'.repeat(64)}]};
  const allProjects=projects||[project];
  const document={hidden:false,documentElement:{scrollHeight:1},querySelectorAll:selector=>selector==='#studioAgentComposer'?[root]:[],querySelector:()=>null,getElementById:id=>id==='studioAgentHistoryHost'?history:null,createElement:name=>new FakeNode(name),addEventListener(){}};
  const writes=[];
  const fetch=async(raw,options={})=>{
    const url=new URL(raw,'http://localhost');
    if(url.pathname==='/api/agent/context')return {ok:true,json:async()=>({projects:allProjects})};
    if(url.pathname==='/api/agent/requests'&&options.method==='POST'){const payload=JSON.parse(options.body);return {ok:true,json:async()=>({request:{requestId:payload.requestId,status:'accepted',payload}})}};
    if(url.pathname==='/api/agent/requests')return {ok:true,json:async()=>({requests:[]})};
    if(url.pathname==='/api/agent/history')return {ok:true,json:async()=>({fetchedAt:'2026-10-20T12:00:00Z',nextCursor:null,turns:[]})};
    if(url.pathname==='/api/agent/draft'&&options.method==='POST'){const body=JSON.parse(options.body);writes.push(body);return postDraft(body)};
    if(url.pathname==='/api/agent/draft')return getDraft?getDraft():{ok:true,json:async()=>({projectId:project.projectId,scope:'detail',draft:serverDraft??null})};
    throw Error(url.pathname);
  };
  const window={__STUDIO_BOOTSTRAP__:{token,groupId:'g'.repeat(64)},RoadMusicAgentUI:null,innerHeight:100,scrollY:0,addEventListener(){},scrollTo(){}};
  const ctx=vm.createContext({window,document,location:{origin:'http://localhost'},fetch,sessionStorage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,String(value))},navigator:{clipboard:{writeText:async()=>{}}},crypto:{getRandomValues:bytes=>{bytes.fill(6);return bytes}},AbortSignal,AbortController,URL,Intl,queueMicrotask,Uint8Array,JSON,String,Number,Object,Array,Set,Error,RegExp,Promise,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{}});
  vm.runInContext(script,ctx);
  return {root,local,writes,project,projects:allProjects,ctx};
}
const savedServerDraft={target:'lyrics',intent:'review',prompt:'서버에 저장한 가사 초안',preserve:'원본 보존',revisedLyrics:'수정 가사',mediaId:'music-0',mediaSha256:'a'.repeat(64),rangeStart:'',rangeEnd:'',requestId:'',status:''};
const restoredMount=draftMount({token:'new-token',serverDraft:savedServerDraft});
await settle();await settle();
const restoredPrompt=walk(restoredMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
assert.equal(restoredPrompt.value,'서버에 저장한 가사 초안');
assert.equal(restoredMount.writes.length,0,'initial draft lookup must not overwrite a saved server draft');
console.log('agent UI VM: a new token restores the stored project draft without an empty write');

const completedEditedDraft={...savedServerDraft,requestId:'c'.repeat(48),status:'succeeded',submittedFingerprint:ui.fingerprint({...savedServerDraft,prompt:'이미 완료된 이전 초안',range:null})};
const completedEditedMount=draftMount({token:'completed-edited-token',serverDraft:completedEditedDraft});
await settle();await settle();
const completedEditedPrompt=walk(completedEditedMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
assert.equal(completedEditedPrompt.value,'서버에 저장한 가사 초안');
assert.equal(walk(completedEditedMount.root,node=>node.ariaLabel==='요청 대상').value,'lyrics');
console.log('agent UI VM: an edited completed draft keeps its unsent text instead of clearing it on restart');

const completedUnchangedDraft={...savedServerDraft,requestId:'d'.repeat(48),status:'succeeded',submittedFingerprint:ui.fingerprint({...savedServerDraft,range:null})};
const completedUnchangedMount=draftMount({token:'completed-unchanged-token',serverDraft:completedUnchangedDraft});
await settle();await settle();
assert.equal(walk(completedUnchangedMount.root,node=>node.name==='textarea'&&node.maxLength===12000).value,'');
assert.equal(walk(completedUnchangedMount.root,node=>node.ariaLabel==='요청 대상').value,'chat');
console.log('agent UI VM: an unchanged completed draft starts a fresh chat after restart');

const completedPartialDraft={...completedUnchangedDraft,prompt:'완료 뒤 입력한 새 수정 내용',rangeStart:'12',rangeEnd:''};
const completedPartialMount=draftMount({token:'completed-partial-token',serverDraft:completedPartialDraft});
await settle();await settle();
assert.equal(walk(completedPartialMount.root,node=>node.name==='textarea'&&node.maxLength===12000).value,'완료 뒤 입력한 새 수정 내용');
assert.equal(walk(completedPartialMount.root,node=>node.ariaLabel==='수정 구간 시작 초').value,'12');
console.log('agent UI VM: an incomplete edited range keeps the completed draft text on restart');

let releaseDraftRead;
const delayedMount=draftMount({token:'race-token',getDraft:()=>new Promise(resolve=>{releaseDraftRead=()=>resolve({ok:true,json:async()=>({draft:savedServerDraft})})})});
await settle();
const delayedPrompt=walk(delayedMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
delayedPrompt.value='읽기 응답보다 나중에 입력한 초안';
delayedPrompt.listeners.input[0]();
releaseDraftRead();
await settle();await new Promise(resolve=>setTimeout(resolve,450));
assert.equal(delayedPrompt.value,'읽기 응답보다 나중에 입력한 초안');
assert.equal(delayedMount.writes.at(-1).draft.prompt,'읽기 응답보다 나중에 입력한 초안');
console.log('agent UI VM: a late draft read cannot overwrite newly typed text');

let releaseFirstWrite;
const serialMount=draftMount({token:'serial-token',serverDraft:null,postDraft:async body=>{
  if(!releaseFirstWrite)return new Promise(resolve=>{releaseFirstWrite=()=>resolve({ok:true,json:async()=>({savedAt:'now'})})});
  return {ok:true,json:async()=>({savedAt:'now'})};
}});
await settle();await settle();
const serialPrompt=walk(serialMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
serialPrompt.value='첫 초안';serialPrompt.listeners.input[0]();
await new Promise(resolve=>setTimeout(resolve,450));
serialPrompt.value='둘째 초안';serialPrompt.listeners.input[0]();
await new Promise(resolve=>setTimeout(resolve,450));
releaseFirstWrite();
await settle();await settle();
assert.deepEqual(serialMount.writes.map(row=>row.draft.prompt),['첫 초안','둘째 초안']);
assert.equal(serialMount.writes.every(row=>row.scope==='detail'&&row.projectId===serialMount.project.projectId),true);
console.log('agent UI VM: debounced server draft writes remain serialized and project-scoped');

const switchA={...fixtureProject,projectId:'a'.repeat(64),projectName:'전환 전',media:[]};
const switchB={...fixtureProject,projectId:'b'.repeat(64),projectName:'전환 후',media:[]};
const switchMount=draftMount({token:'switch-token',serverDraft:null,projects:[switchA,switchB],postDraft:async()=>({ok:true,json:async()=>({savedAt:'now'})})});
await settle();await settle();
const switchPrompt=walk(switchMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
const switchSelect=walk(switchMount.root,node=>node.ariaLabel==='요청할 프로젝트');
switchPrompt.value='전환 직전 작성한 A 초안';switchPrompt.listeners.input[0]();
switchSelect.value=switchB.projectId;
await switchSelect.listeners.change[0]();
assert.equal(switchMount.writes[0].projectId,switchA.projectId);
assert.equal(switchMount.writes[0].draft.prompt,'전환 직전 작성한 A 초안');
console.log('agent UI VM: switching projects flushes the previous project draft before changing scope');

const blockedSwitchMount=draftMount({token:'blocked-switch-token',serverDraft:null,projects:[switchA,switchB],postDraft:async()=>({ok:false,json:async()=>({error:'저장 불가'})})});
await settle();await settle();
const blockedPrompt=walk(blockedSwitchMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
const blockedSelect=walk(blockedSwitchMount.root,node=>node.ariaLabel==='요청할 프로젝트');
blockedPrompt.value='저장 실패에도 남겨야 하는 A 초안';blockedPrompt.listeners.input[0]();
blockedSelect.value=switchB.projectId;
await blockedSelect.listeners.change[0]();
assert.equal(blockedSelect.value,switchA.projectId);
assert.equal(blockedPrompt.value,'저장 실패에도 남겨야 하는 A 초안');
assert.match(collect(blockedSwitchMount.root),/프로젝트 전환을 취소/);
console.log('agent UI VM: a failed project-switch flush keeps the current draft and blocks the switch');

let releaseSubmitDraft,delaySubmitDraft=true;
const submitSwitchMount=draftMount({token:'submit-switch-token',serverDraft:null,projects:[switchA,switchB],postDraft:async()=>delaySubmitDraft?new Promise(resolve=>{delaySubmitDraft=false;releaseSubmitDraft=()=>resolve({ok:true,json:async()=>({savedAt:'now'})})}):({ok:true,json:async()=>({savedAt:'now'})})});
await settle();await settle();
const submitSwitchPrompt=walk(submitSwitchMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
const submitSwitchSelect=walk(submitSwitchMount.root,node=>node.ariaLabel==='요청할 프로젝트');
const submitSwitchSend=walk(submitSwitchMount.root,node=>node.textContent==='Codex에 요청 보내기');
submitSwitchPrompt.value='전송 중 프로젝트 전환 차단';submitSwitchPrompt.listeners.input[0]();
const submittingRequest=submitSwitchSend.listeners.click[0]();
await settle();
submitSwitchSelect.value=switchB.projectId;
await submitSwitchSelect.listeners.change[0]();
assert.equal(submitSwitchSelect.value,switchA.projectId);
releaseSubmitDraft();
await submittingRequest;
console.log('agent UI VM: project switching is blocked while a request draft is being persisted');

const failedMount=draftMount({token:'failed-token',serverDraft:null,postDraft:async()=>({ok:false,json:async()=>({error:'저장 불가'})})});
await settle();await settle();
const failedPrompt=walk(failedMount.root,node=>node.name==='textarea'&&node.maxLength===12000);
failedPrompt.value='로컬에는 남아야 하는 초안';failedPrompt.listeners.input[0]();
await new Promise(resolve=>setTimeout(resolve,450));
assert.equal([...failedMount.local.values()].some(value=>value.includes('로컬에는 남아야 하는 초안')),true);
assert.match(collect(failedMount.root),/초안 저장 실패/);
assert.equal(failedMount.writes.some(row=>row.target==='chat'&&row.intent==='review'&&row.prompt===''),false,'draft persistence must not submit a request');
console.log('agent UI VM: failed server persistence keeps the local draft and never queues a request');
