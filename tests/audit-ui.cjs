// Node VM audit: mocked DOM, tabs, clipboard and storage; not browser integration.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor(tag='div') {
    this.tag=tag; this.children=[]; this.events={}; this.dataset={}; this.value=''; this.checked=false;
    const c=new Set(); this.classList={add:x=>c.add(x),remove:x=>c.delete(x),toggle:(x,f)=>f?c.add(x):c.delete(x)};
    this.style={setProperty(){}};
  }
  set innerHTML(v) {this.children=[];}
  appendChild(c) {this.children.push(c);return c;}
  addEventListener(n,f) {this.events[n]=f;}
}
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function storageBus() {
  const data={}, changed=[], messages=[];
  const bus={data,changed,messages,failNextSet:false};
  bus.storage={
    async get(k){return clone({[k]:data[k]});},
    async set(v){
      if(bus.failNextSet){bus.failNextSet=false;throw new Error('Storage unavailable');}
      const changes={};
      for(const [key,value] of Object.entries(v)) changes[key]={oldValue:clone(data[key]),newValue:clone(value)};
      Object.assign(data,clone(v));
      for(const listener of changed) listener(changes,'local');
    }
  };
  bus.runtime={onMessage:{addListener:f=>messages.push(f)},async sendMessage(message){
    return new Promise((resolve,reject)=>{
      for(const listener of messages) {
        const retained=listener(clone(message),{id:'test-extension'},value=>resolve(clone(value)));
        if(retained===true)return;
      }
      reject(new Error('No background writer'));
    });
  }};
  return bus;
}
function environment(files=[],shared) {
  const bus=shared||storageBus(), data=bus.data, elements=new Map(), domEvents={}, written=[], navigations=[];
  const getElement=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const descendants=e=>e.children.flatMap(c=>[c,...descendants(c)]);
  const state={tabUrl:'https://rating.pecheny.me/teams/42?year=2026#results'};
  const context=vm.createContext({URL,URLSearchParams,console,Date,setTimeout:()=>1,clearTimeout(){},alert(){},
    document:{addEventListener:(n,f)=>{domEvents[n]=f;},getElementById:getElement,createElement:t=>new Element(t),
      querySelector:getElement,querySelectorAll:()=>descendants(getElement('hosts-tbody')).filter(e=>e.tag==='input'),body:new Element()},
    navigator:{clipboard:{async writeText(t){written.push(t);}}},
    chrome:{storage:{local:bus.storage,session:bus.storage,onChanged:{addListener:f=>bus.changed.push(f)}},runtime:bus.runtime,tabs:{
      async query(){return [{id:1,url:state.tabUrl}];},
      async update(id,info){navigations.push({id,...info});}}}});
  for(const f of ['sites.js','settings.js',...files])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),context,{filename:f});
  const result={bus,data,state,getElement,domEvents,written,navigations,context,run:s=>vm.runInContext(s,context)};
  if(!shared)result.run('Settings.initializeBackground()');
  return result;
}
(async()=>{
  let positiveChecks=0;
  const check=(actual,expected)=>{assert.deepEqual(actual,expected);positiveChecks++;};
  const e=environment(), sites=e.run('Sites'), hosts=Array.from(sites.ALL_HOSTS);
  const paths=[
    ['/players/42','/players/42','/players/42','/players/42','/b/player/42/','/player/42','/player/42','/players/42'],
    ['/teams/42','/teams/42','/teams/42','/teams/42','/b/team/42/','/teams/42','/team/42','/teams/42'],
    ['/tournament/42','/tournament/42','/tournament/42','/tournament/42','/b/tournament/42/','/tournament/42','/tournament/42','/tournaments/42'],
    ['/','/','/','/','/b/','/','/','/']];
  for(const p of paths)for(let a=0;a<8;a++)for(let b=0;b<8;b++){
    check(sites.hasExactPath(p[a],hosts[a],hosts[b]),true);
    check(sites.convertPath(p[a],hosts[a],hosts[b]),p[b]+(a===4 && b<4 && p[a]!=='/b/' ? '/' : ''));
  }
  check(sites.convertPath('/players/42/results?x=1#rank',hosts[0],hosts[1]),'/players/42/results?x=1#rank');
  check(sites.convertPath('/players/42/results?x=1#rank',hosts[0],hosts[4]),'/b/player/42/');
  check(sites.hasExactPath('/news',hosts[0],hosts[4]),false);
  check(sites.hasExactPath('/news',hosts[0],hosts[1]),true);
  check(sites.convertPath('/players/42?sort=rating&dir=desc&year=2026#rank',hosts[7],hosts[0]),'/players/42?year=2026#rank');
  await e.run('Settings.setFallbackForTab(1,{failedHost:"rating.chgk.info",path:"/teams/42"})');
  check((await e.run('Settings.getFallbackForTab(1)')).path,'/teams/42');
  e.data.loadFallbacks['1'].ts=Date.now()-301000;
  check(await e.run('Settings.getFallbackForTab(1)'),null);
  check(e.data.loadFallbacks['1'],undefined);
  const popup=environment(['popup.js']);
  await popup.run('refreshPopup()');
  await popup.run('copyUrlForHost("rating.pecheny.kz")');
  check(popup.written[0],'https://rating.pecheny.kz/teams/42?year=2026#results');
  await popup.run('navigateToHost("rating.pecheny.kz")');
  check(new URL(popup.navigations[0].url).hash,'#results');
  await popup.run('Settings.setFallbackForTab(1,{failedHost:"rating.chgk.info",path:"/teams/42"})');
  await popup.run('refreshPopup()');
  const fallbackHosts=()=>popup.getElement('fallback-banner').children[1].children.map(x=>x.title);
  check(fallbackHosts().includes('rating.pecheny.kz'),true);
  await popup.run('Settings.save({visibleSwitchHosts:{"rating.pecheny.kz":false}})');
  await popup.run('refreshPopup()');
  check(fallbackHosts().includes('rating.pecheny.kz'),false);
  // Separate VM globals share only WebExtension storage + runtime messages.
  const shared=storageBus(), background=environment([],shared);
  background.run('Settings.initializeBackground()');
  const options=environment(['options.js'],shared), popupWriter=environment([],shared);
  await options.domEvents.DOMContentLoaded();
  await popupWriter.run('Settings.setPreferredTsHost("rating.pecheny.ru")');
  await options.run('refreshOptions()');
  check(options.getElement('opt-preferred').value,'rating.pecheny.ru');
  // Deliberately retain stale unrelated values to prove only the edited field is saved.
  options.getElement('opt-preferred').value='off';
  options.getElement('opt-fallback').checked=false;
  await options.getElement('opt-fallback').events.change({target:options.getElement('opt-fallback')});
  check(shared.data.tsSwitcherSettings.preferredTsHost,'rating.pecheny.ru');
  check(shared.data.tsSwitcherSettings.fallbackOnError,false);
  await popupWriter.run('Settings.save({fallbackOnError:true,preferredTsHost:"off"})');
  await Promise.all([
    options.run('Settings.save({fallbackOnError:false})'),
    popupWriter.run('Settings.setPreferredTsHost("rating.pecheny.ru")')
  ]);
  check(shared.data.tsSwitcherSettings.fallbackOnError,false);
  check(shared.data.tsSwitcherSettings.preferredTsHost,'rating.pecheny.ru');
  await Promise.all([
    options.run('Settings.save({visibleSwitchHosts:{"rating.pecheny.kz":false}})'),
    popupWriter.run('Settings.save({visibleSwitchHosts:{"rating.pecheny.me":false}})')
  ]);
  check(shared.data.tsSwitcherSettings.visibleSwitchHosts['rating.pecheny.kz'],false);
  check(shared.data.tsSwitcherSettings.visibleSwitchHosts['rating.pecheny.me'],false);
  check(shared.data.tsSwitcherSettings.preferredTsHost,'rating.pecheny.ru');
  await options.run('Settings.save({visibleSwitchHosts:{"rating.pecheny.ru":false}})');
  check(shared.data.tsSwitcherSettings.preferredTsHost,'off');
  await popupWriter.run('Settings.setPreferredTsHost("rating.pecheny.ru")');
  check(shared.data.tsSwitcherSettings.preferredTsHost,'off');
  await Promise.all([
    background.run('Settings.setFallbackForTab(1,{path:"/teams/1"})'),
    popupWriter.run('Settings.setFallbackForTab(2,{path:"/teams/2"})')
  ]);
  check(Object.keys(shared.data.loadFallbacks).sort(),['1','2']);
  await Promise.all([
    options.run('Settings.clearFallbackForTab(1)'),
    background.run('Settings.setFallbackForTab(3,{path:"/teams/3"})')
  ]);
  check(Object.keys(shared.data.loadFallbacks).sort(),['2','3']);
  // Expiring an old read must not delete a replacement queued by another context.
  shared.data.loadFallbacks['2'].ts=Date.now()-301000;
  await Promise.all([
    options.run('Settings.getFallbackForTab(2)'),
    background.run('Settings.setFallbackForTab(2,{path:"/teams/new"})')
  ]);
  check(shared.data.loadFallbacks['2'].path,'/teams/new');
  // A read already in flight must not undo unsaved controls, even when a
  // second click or another page's storage event arrives before acknowledgement.
  const raceBus=storageBus(), raceBackground=environment([],raceBus);
  raceBackground.run('Settings.initializeBackground()');
  const raceOptions=environment(['options.js'],raceBus);
  await raceOptions.domEvents.DOMContentLoaded();
  const originalLoad=raceOptions.run('Settings.load');
  let releaseRead;
  raceOptions.run('Settings').load=async()=>{
    const snapshot=await originalLoad();
    return new Promise(resolve=>{releaseRead=()=>resolve(snapshot);});
  };
  const staleRefresh=raceOptions.run('refreshOptions()');
  await new Promise(resolve=>setImmediate(resolve));
  const originalSend=raceBus.runtime.sendMessage;
  const pendingMessages=[];
  raceBus.runtime.sendMessage=message=>new Promise((resolve,reject)=>pendingMessages.push({message,resolve,reject}));
  const raceCheckbox=raceOptions.getElement('opt-fallback');
  raceCheckbox.checked=false;
  const firstSave=raceCheckbox.events.change({target:raceCheckbox});
  releaseRead();
  await staleRefresh;
  check(raceCheckbox.checked,false);
  // This external write triggers options.onChanged while the edit is pending.
  await raceBackground.run('Settings.setPreferredTsHost("rating.pecheny.ru")');
  check(raceCheckbox.checked,false);
  raceCheckbox.checked=!raceCheckbox.checked;
  const secondSave=raceCheckbox.events.change({target:raceCheckbox});
  check(pendingMessages.map(item=>item.message.payload.fallbackOnError),[false,true]);
  raceOptions.run('Settings').load=originalLoad;
  for(const item of pendingMessages){
    try{item.resolve(await originalSend(item.message));}catch(error){item.reject(error);}
  }
  await Promise.all([firstSave,secondSave]);
  check(raceBus.data.tsSwitcherSettings.fallbackOnError,true);
  check(raceCheckbox.checked,true);
  check(raceOptions.getElement('opt-preferred').value,'rating.pecheny.ru');
  // Failure must release the pending-edit guard and restore stored values.
  raceBus.runtime.sendMessage=originalSend;
  raceBus.failNextSet=true;
  raceCheckbox.checked=false;
  await raceCheckbox.events.change({target:raceCheckbox});
  check(raceCheckbox.checked,true);
  check(raceOptions.getElement('save-status').textContent.includes('Не удалось сохранить'),true);
  await raceBackground.run('Settings.setPreferredTsHost("rating.pecheny.me")');
  await raceOptions.run('refreshOptions()');
  check(raceOptions.getElement('opt-preferred').value,'rating.pecheny.me');
  shared.failNextSet=true;
  await assert.rejects(popupWriter.run('Settings.save({fallbackOnError:true})'),/Storage unavailable/);
  await popupWriter.run('Settings.save({fallbackOnError:true})');
  check(shared.data.tsSwitcherSettings.fallbackOnError,true);
  check(await shared.runtime.sendMessage({type:'TS_SWITCHER_SETTINGS_WRITE',operation:'unknown'}),{ok:false,error:'Unknown settings operation'});
  await popupWriter.run('Settings.save({fallbackOnError:false})');
  check(shared.data.tsSwitcherSettings.fallbackOnError,false);
  // Hash-only changes must invalidate the rendered button cache as well.
  popup.state.tabUrl='https://rating.pecheny.me/teams/42?year=2026#new-results';
  await popup.run('refreshPopup()');
  check(popup.getElement('copy-ts-row').children[0].title,'https://rating.chgk.info/teams/42?year=2026#new-results');
  const content=environment();
  content.context.window={location:{href:'https://rating.pecheny.me/teams/42?ts_switcher_direct=1#rank'},
    history:{state:{siteRoute:'teams'},replaceState(state,title,url){this.state=state;this.url=url;}}};
  content.run(fs.readFileSync(path.join(__dirname,'../src/content.js'),'utf8'));
  check(content.context.window.history.url,'https://rating.pecheny.me/teams/42#rank');
  check(clone(content.context.window.history.state),{siteRoute:'teams'});
  console.log(JSON.stringify({environment:'Node VM; mocked DOM and extension APIs; no browser or website verification',positiveChecks,result:'All regression expectations passed'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
