// Real Firefox integration: temporary addon via Mozilla RDP; no user profile.
// PLAYWRIGHT_MODULE points to Playwright; FIREFOX_PATH optionally overrides its Firefox.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),https=require('node:https'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function rdp(port){
 const socket=net.connect(port,'127.0.0.1');let bytes=Buffer.alloc(0),messages=[],waiters=[];
 socket.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);while(true){const colon=bytes.indexOf(':');if(colon<0)return;const len=Number(bytes.subarray(0,colon).toString());if(bytes.length<colon+1+len)return;const m=JSON.parse(bytes.subarray(colon+1,colon+1+len));bytes=bytes.subarray(colon+1+len);const idx=waiters.findIndex(w=>w.p(m));if(idx>=0)waiters.splice(idx,1)[0].r(m);else messages.push(m);}});
 await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});
 const wait=p=>new Promise((r,j)=>{const idx=messages.findIndex(p);if(idx>=0)return r(messages.splice(idx,1)[0]);const w={p,r:m=>{clearTimeout(timer);r(m);}};const timer=setTimeout(()=>{waiters=waiters.filter(x=>x!==w);j(Error('RDP response timed out'));},15000);waiters.push(w);});
 const request=async msg=>{const text=JSON.stringify(msg);socket.write(Buffer.byteLength(text)+':'+text);const response=await wait(m=>m.from===msg.to&&!m.type);if(response.error)throw Error(response.message);return response;};
 const evaluate=async(actor,text)=>{const ack=await request({to:actor,type:'evaluateJSAsync',text});const result=await wait(m=>m.type==='evaluationResult'&&m.resultID===ack.resultID);if(result.hasException)throw Error(result.exceptionMessage||JSON.stringify(result));return result.result;};
 let evaluationId=0;
 const evaluateAsync=async(actor,expression)=>{
  const key='__auditResult'+(++evaluationId);
  await evaluate(actor,`Promise.resolve().then(async()=>(${expression})).then(value=>window.${key}={ok:true,value},error=>window.${key}={ok:false,error:String(error)})`);
  for(let i=0;i<100;i++){const value=await evaluate(actor,`JSON.stringify(window.${key}||null)`);const parsed=JSON.parse(value);if(parsed){await evaluate(actor,`delete window.${key}`);if(!parsed.ok)throw Error(parsed.error);return parsed.value;}await delay(30);}
  throw Error('Async browser operation timed out');
 };
 await wait(m=>m.from==='root');return {wait,request,evaluate,evaluateAsync,close:()=>socket.destroy()};
}
(async()=>{
 const report={date:new Date().toISOString(),environment:'Real Firefox, temporary addon, controlled network responses',checks:[]};
 const check=(name,observed,expected)=>{const pass=JSON.stringify(observed)===JSON.stringify(expected);report.checks.push({name,pass,observed,expected});console.log((pass?'PASS ':'FAIL ')+name);};
 const temp=await fs.mkdtemp(path.join(__dirname,'firefox-audit-'));const src=path.join(temp,'extension');await fs.cp(path.join(__dirname,'../src'),src,{recursive:true});await fs.copyFile(path.join(src,'manifest-firefox.json'),path.join(src,'manifest.json'));
 let context,client,fixture;
 try{
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const openssl=process.env.OPENSSL_PATH||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore',windowsHide:true});
  fixture=https.createServer({key:await fs.readFile(path.join(temp,'key.pem')),cert:await fs.readFile(path.join(temp,'cert.pem'))},(req,res)=>{
   if(req.url==='/logout'){res.writeHead(302,{location:'/'});res.end();return;}
   res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Controlled fixture</title><body>Fixture</body>');
  });
  await new Promise(r=>fixture.listen(0,'127.0.0.1',r));const fixturePort=fixture.address().port;
  context=await firefox.launchPersistentContext(path.join(temp,'profile'),{headless:true,ignoreHTTPSErrors:true,...(process.env.FIREFOX_PATH?{executablePath:process.env.FIREFOX_PATH}:{}),args:['-start-debugger-server',String(port)],firefoxUserPrefs:{'devtools.debugger.remote-enabled':true,'devtools.debugger.force-local':true,'devtools.debugger.prompt-connection':false,'devtools.chrome.enabled':true,'network.dns.forceResolve':'127.0.0.1','network.proxy.type':0}});
  report.browser=context.browser()?.version();
  await context.route('https://**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/dns-failure')return route.abort('namenotresolved');
   if(url.pathname==='/aborted')return route.abort('aborted');
   return route.continue();
  });
  client=await rdp(port);const root=await client.request({to:'root',type:'getRoot'});await client.request({to:root.addonsActor,type:'installTemporaryAddon',addonPath:src});
  const addons=await client.request({to:'root',type:'listAddons'});const addon=addons.addons.find(a=>a.id==='ts-switcher@chgk.info');check('temporary addon has no manifest warnings',addon.warnings,[]);
  const watcher=await client.request({to:addon.actor,type:'getWatcher',isServerTargetSwitchingEnabled:true});await client.request({to:watcher.actor,type:'watchTargets',targetType:'frame'});
  const target=await client.wait(m=>m.type==='target-available-form'&&m.target.url.endsWith('_generated_background_page.html'));const bg=target.target.consoleActor;
  const run=expression=>client.evaluateAsync(bg,expression);
  check('real Firefox background initializes Settings',await client.evaluate(bg,'typeof Settings'),'object');
  await run('browser.tabs.create({url:browser.runtime.getURL("options.html")})');
  const opt=(await client.wait(m=>m.type==='target-available-form'&&m.target.url.endsWith('/options.html'))).target.consoleActor;
  for(let i=0;i<100;i++){if(await client.evaluate(opt,'typeof Settings')==='object')break;await delay(30);}
  const options=expression=>client.evaluateAsync(opt,expression);
  await options('refreshOptions()');
  check('options loads bundled Noto Sans',await options(`(await document.fonts.load('400 14px "Noto Sans"','Настройки TS')).length`),1);
  check('options initializes preferred selector',await client.evaluate(opt,'document.getElementById("opt-preferred").value'),'off');
  await options('Settings.setPreferredTsHost("rating.pecheny.ru")');
  check('options saves through runtime to background',await run('(await Settings.load()).preferredTsHost'),'rating.pecheny.ru');
  await Promise.all([options('Settings.save({fallbackOnError:false})'),run('Settings.save({visibleCopyHosts:{"rating.pecheny.kz":false}})')]);
  check('cross-context writes preserve both changes',await run('[(await Settings.load()).fallbackOnError,(await Settings.load()).visibleCopyHosts["rating.pecheny.kz"]]'),[false,false]);
  await run('Settings.setPreferredTsHost("rating.pecheny.me")');await options('refreshOptions()');
  check('open options sees external preference',await client.evaluate(opt,'document.getElementById("opt-preferred").value'),'rating.pecheny.me');
  await options('(async()=>{document.getElementById("opt-preferred").value="off";const el=document.getElementById("opt-fallback");el.checked=true;await saveFromForm({target:el});})()');
  check('stale unrelated field is not persisted',await run('(await Settings.load()).preferredTsHost'),'rating.pecheny.me');
  await run('Settings.setPreferredTsHost("rating.pecheny.ru")');
  const page=await context.newPage();
  const navigate=async url=>{const localUrl=new URL(url);localUrl.port=fixturePort;await page.goto(localUrl.toString(),{waitUntil:'domcontentloaded',timeout:10000}).catch(e=>{if(!/NS_BINDING_ABORTED|NS_ERROR|ERR_|Navigation|net::/.test(e.message))throw e;});await delay(150);const observed=new URL(page.url());observed.port='';return observed.toString();};
  check('preferred redirects actual Firefox navigation',await navigate('https://rating.pecheny.me/teams/42?year=2026#rank'),'https://rating.pecheny.ru/teams/42?year=2026#rank');
  check('one-shot bypass keeps chosen mirror',await navigate('https://rating.pecheny.me/teams/42?ts_switcher_direct=1#rank'),'https://rating.pecheny.me/teams/42#rank');
  check('bypass does not disable subsequent interception',await navigate('https://rating.pecheny.me/teams/43'),'https://rating.pecheny.ru/teams/43');
  check('mirror login is exempt',await navigate('https://rating.pecheny.me/login'),'https://rating.pecheny.me/login');
  check('login grace exempts later same-tab navigation',await navigate('https://rating.pecheny.me/teams/44'),'https://rating.pecheny.me/teams/44');
  await navigate('https://rating.pecheny.me/logout');
  check('logout HTTP 302 clears grace',await navigate('https://rating.pecheny.me/teams/45'),'https://rating.pecheny.ru/teams/45');
  await run('Settings.save({preferredTsHost:"off",fallbackOnError:true})');
  await navigate('https://rating.pecheny.me/dns-failure');
  check('DNS failure keeps fallback',await run('(await browser.tabs.query({})).some(t=>t.url.includes("dns-failure"))'),true);
  const failedTab=await run('(await browser.tabs.query({})).find(t=>t.url.includes("dns-failure"))');
  check('DNS fallback retained after error page completes',await run(`(await Settings.getFallbackForTab(${failedTab.id}))?.failedHost`),'rating.pecheny.me');
  await navigate('https://rating.pecheny.me/teams/46');
  check('successful navigation clears fallback',await run(`Settings.getFallbackForTab(${failedTab.id})`),null);
  // Real theme ports between popup and top-frame content script.
  await run('browser.tabs.create({url:browser.runtime.getURL("popup.html")})');
  const popupActor=(await client.wait(m=>m.type==='target-available-form'&&m.target.url.endsWith('/popup.html'))).target.consoleActor;
  for(let i=0;i<100;i++){if(await client.evaluate(popupActor,'typeof PopupTheme')==='object')break;await delay(30);}
  check('popup loads bundled Noto Sans',await client.evaluateAsync(popupActor,`(await document.fonts.load('400 12px "Noto Sans"','Турнирный TS')).length`),1);
  const sourceTab=await run('(await browser.tabs.query({})).find(t=>t.url.includes("/teams/46"))');
  await run(`browser.tabs.update(${sourceTab.id},{active:true})`);
  await client.evaluateAsync(popupActor,'refreshPopup()');
  async function themeState(expected){
   let actual;
   for(let i=0;i<100;i++){
    actual=JSON.parse(await client.evaluate(popupActor,'JSON.stringify([document.documentElement.dataset.siteTheme,document.documentElement.dataset.bsTheme,document.documentElement.dataset.contrast])'));
    if(JSON.stringify(actual)===JSON.stringify(expected))return actual;
    await delay(30);
   }
   return actual;
  }
  for(const family of ['classic','oldschool','catppuccin','colorblind'])for(const scheme of ['light','dark']){
   await page.evaluate(({family,scheme})=>{document.documentElement.dataset.siteTheme=family;document.documentElement.dataset.bsTheme=scheme;},{family,scheme});
   check('popup theme '+family+'/'+scheme,await themeState([family,scheme,'normal']),[family,scheme,'normal']);
  }
  await options('Settings.save({tsColorScheme:"light",tsTheme:"oldschool",tsContrast:"more"})');
  check('popup applies independent manual settings',await themeState(['oldschool','light','more']),['oldschool','light','more']);
  check('options shares manual contrast',await client.evaluate(opt,'getComputedStyle(document.body).backgroundColor'),'rgb(246, 248, 250)');
  check('contrast CSS actually overrides family',await client.evaluate(popupActor,'getComputedStyle(document.body).backgroundColor'),'rgb(246, 248, 250)');
  await options('Settings.save({tsContrast:"auto"})');
  check('automatic contrast defaults to normal',await themeState(['oldschool','light','normal']),['oldschool','light','normal']);
  await page.evaluate(()=>document.documentElement.dataset.contrast='high');
  check('automatic contrast follows site',await themeState(['oldschool','light','more']),['oldschool','light','more']);
  await options('Settings.save({tsContrast:"normal"})');
  check('manual normal overrides site high',await themeState(['oldschool','light','normal']),['oldschool','light','normal']);
  await options('Settings.save({tsContrast:"auto"})');
  await page.evaluate(()=>delete document.documentElement.dataset.contrast);
  check('removing site contrast restores normal',await themeState(['oldschool','light','normal']),['oldschool','light','normal']);
  await page.emulateMedia({colorScheme:'dark'});
  await navigate('https://rating.chgk.gg/b/team/42/');
  await client.evaluateAsync(popupActor,'refreshPopup()');
  check('gg follows page dark mode',await themeState(['rating','dark','normal']),['rating','dark','normal']);
  // Firefox Playwright can create the source page in another browser window.
  const optionsTab=await options('browser.tabs.getCurrent()');
  if(optionsTab.windowId!==sourceTab.windowId) await run(`browser.tabs.move(${optionsTab.id},{windowId:${sourceTab.windowId},index:-1})`);
  await run(`browser.tabs.update(${sourceTab.id},{active:true})`);
  await options('OptionsTheme.update(await Settings.load())');
  for(let i=0;i<100;i++){if(await client.evaluate(opt,'document.documentElement.dataset.themeGroup+"/"+document.documentElement.dataset.bsTheme')==='rating/dark')break;await delay(30);}
  check('options uses rating palette',await client.evaluate(opt,'getComputedStyle(document.body).backgroundColor'),'rgb(17, 24, 39)');
  await page.emulateMedia({colorScheme:'light'});
  check('gg follows page media change',await themeState(['rating','light','normal']),['rating','light','normal']);
  await options('Settings.save({ratingColorScheme:"dark"})');
  for(const host of ['rating.chgk.fun','chgk.quest','elo-chgk.uk']){
   await navigate('https://'+host+'/');await client.evaluateAsync(popupActor,'refreshPopup()');
   check('rating manual mode on '+host,await themeState(['rating','dark','normal']),['rating','dark','normal']);
  }
  report.passed=report.checks.filter(c=>c.pass).length;report.failed=report.checks.length-report.passed;process.exitCode=report.failed?1:0;
 }catch(error){report.fatal=String(error.stack||error);console.error(error);process.exitCode=2;}
 finally{
  if(client)client.close();if(context)await context.close();if(fixture)await new Promise(r=>fixture.close(r));
  await fs.writeFile(path.join(__dirname,'audit-firefox.out.json'),JSON.stringify(report,null,2)+'\n');
  // Only remove the temporary directory this process just created under tests.
  const resolved=path.resolve(temp);assert.equal(path.dirname(resolved),path.resolve(__dirname));assert.ok(path.basename(resolved).startsWith('firefox-audit-'));await fs.rm(resolved,{recursive:true,force:true});
 }
 console.log(JSON.stringify({passed:report.passed,failed:report.failed,fatal:report.fatal},null,2));
})().catch(error=>{console.error(error);process.exitCode=2;});
