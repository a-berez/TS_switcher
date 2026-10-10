// Theme policy and port lifetime in isolated VM contexts.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../src');
const c=vm.createContext({URL});
for(const name of ['sites.js','theme.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),c);
const Theme=vm.runInContext('Theme',c);
const defaults={tsTheme:'auto',tsColorScheme:'auto',tsContrast:'auto',ratingColorScheme:'auto'};
const ts='rating.chgk.info',gg='rating.chgk.gg';
let checks=0;
function check(a,b){assert.deepEqual(JSON.parse(JSON.stringify(a)),b);checks++;}
for(const family of ['classic','oldschool','catppuccin','colorblind'])for(const scheme of ['light','dark']){
 check(Theme.resolve(ts,defaults,{family,scheme},{dark:scheme==='light'}),{group:'ts',family,scheme,contrast:'normal'});
 check(Theme.resolve(ts,{...defaults,tsTheme:family,tsColorScheme:scheme},{family:'unknown',scheme:'bad'},{dark:false}),{group:'ts',family,scheme,contrast:'normal'});
}
check(Theme.resolve(ts,defaults,{family:'unknown',scheme:'bad'},{dark:true}).family,'classic');
check(Theme.resolve(ts,defaults,null,{dark:true,contrast:true}).contrast,'normal');
check(Theme.resolve(ts,defaults,{contrast:'more'},{dark:false}).contrast,'more');
check(Theme.resolve(ts,{...defaults,tsContrast:'normal'},{contrast:'more'},{dark:false}).contrast,'normal');
check(Theme.resolve(ts,{...defaults,tsContrast:'more'},null,{dark:false}).contrast,'more');
check(Theme.resolve(gg,{...defaults,tsContrast:'more'},{scheme:'light'},{dark:true}).contrast,'normal');
check(Theme.resolve(gg,defaults,{scheme:'light'},{dark:true}).scheme,'light');
for(const host of ['rating.chgk.fun','chgk.quest','elo-chgk.uk','a2.pecheny.me']){
 check(Theme.resolve(host,defaults,{scheme:'light'},{dark:true}).scheme,'dark');
 check(Theme.resolve(host,{...defaults,ratingColorScheme:'light'},null,{dark:true}).scheme,'light');
}
const attrs={'data-theme-pref':'dark'};
const el={getAttribute:key=>attrs[key]||null};
check(Theme.readPage(ts,el,false).scheme,'dark');attrs['data-bs-theme']='light';
check(Theme.readPage(ts,el,true).scheme,'light');
for(const value of ['high','normal','more','unknown',null]){
 attrs['data-contrast']=value;
 check(Theme.readPage(ts,el,false).contrast,value==='high'?'more':'normal');
}
// Popup ignores stale connections and updates settings without rebuilding UI.
const ports=[], media={matches:false,addEventListener(type,fn){this.changed=fn;}};
function port(){return {onMessage:{addListener(fn){this.receive=fn;}},onDisconnect:{addListener(fn){this.close=fn;}},disconnect(){this.onDisconnect.close?.();}};}
Object.assign(c,{window:{matchMedia:()=>media,addEventListener(){}},document:{documentElement:{dataset:{}}},chrome:{runtime:{},tabs:{connect(){const p=port();ports.push(p);return p;}}}});
vm.runInContext(fs.readFileSync(path.join(root,'popup-theme.js'),'utf8'),c);
const popup=vm.runInContext('PopupTheme',c),data=c.document.documentElement.dataset;
popup.update({id:1,url:'https://'+ts+'/'},defaults);
ports[0].onMessage.receive({type:'theme',family:'catppuccin',scheme:'dark'});check(data.bsTheme,'dark');
popup.update({id:2,url:'https://'+ts+'/'},defaults);check(data.bsTheme,'light');
ports[0].onMessage.receive({type:'theme',family:'oldschool',scheme:'dark'});check(data.siteTheme,'classic');
ports[1].onMessage.receive({type:'theme',family:'oldschool',scheme:'dark'});check(data.siteTheme,'oldschool');
popup.update({id:2,url:'https://'+ts+'/'},{...defaults,tsColorScheme:'light'});check(data.bsTheme,'light');check(ports.length,2);
popup.invalidate(2,{status:'loading'});check(data.siteTheme,'classic');
ports[1].onMessage.receive({type:'theme',scheme:'dark'});check(data.bsTheme,'light');
popup.update({id:2,url:'https://'+ts+'/',status:'complete'},defaults);check(ports.length,3);
ports[2].onDisconnect.close();check(data.siteTheme,'classic');media.matches=true;media.changed();check(data.bsTheme,'dark');
popup.update({id:3,url:'https://chgk.quest/'},defaults);check(data.themeGroup,'rating');check(ports.length,3);
popup.clear();check(data.themeGroup,'other');
// Content observer lives only as long as its consumer and preserves bypass state.
const listeners=[],sent=[];let observing=false,mediaListeners=0,changed,observedAttributes;
const pageWindow={location:{hostname:ts,href:'https://'+ts+'/?ts_switcher_direct=1#x'},history:{state:{x:1},replaceState(state,title,url){this.url=url;this.state=state;}},matchMedia:()=>({matches:false,addEventListener(){mediaListeners++;},removeEventListener(){mediaListeners--;}})};
pageWindow.top=pageWindow;
Object.assign(c,{window:pageWindow,document:{documentElement:el,title:''},chrome:{runtime:{onConnect:{addListener:f=>listeners.push(f)}}},MutationObserver:class{constructor(f){changed=f;}observe(el,options){observing=true;observedAttributes=options.attributeFilter;}disconnect(){observing=false;}}});
vm.runInContext(fs.readFileSync(path.join(root,'content.js'),'utf8'),c);
check(observing,false);check(pageWindow.history.url,'https://'+ts+'/#x');
const connection={name:Theme.PORT,postMessage:m=>sent.push(m),onDisconnect:{addListener(f){this.close=f;}}};
listeners[0](connection);check(observing,true);check(mediaListeners,1);check(sent.length,1);
changed();check(sent.length,1);attrs['data-bs-theme']='dark';changed();check(sent.length,2);
check(observedAttributes.includes('data-contrast'),true);
attrs['data-contrast']='high';changed();check(sent.at(-1).contrast,'more');
connection.onDisconnect.close();check(observing,false);check(mediaListeners,0);changed();check(sent.length,3);
console.log(`${checks} theme policy/lifecycle expectations passed`);
