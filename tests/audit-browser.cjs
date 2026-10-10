const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),results=[];
function check(name,pass,details){results.push({name,status:pass?'PASS':'FAIL',details});console.log((pass?'PASS ':'FAIL ')+name+': '+JSON.stringify(details));}
(async()=>{
 const c=await chromium.launchPersistentContext('',{executablePath:process.env.CHROMIUM_PATH,channel:process.env.CHROMIUM_PATH?undefined:'chromium',headless:true,args:['--disable-extensions-except='+path.join(root,'src'),'--load-extension='+path.join(root,'src')]});
 try{
 const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker',{timeout:15000});
 const base=w.url().replace(/\/background\.js$/,''),version=c.browser().version(),errors=[];
 c.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await w.evaluate(()=>bootstrap());
 const regex=await w.evaluate(()=>chrome.declarativeNetRequest.isRegexSupported({regex:buildTsRedirectRegexFilter('rating.chgk.info')}));
 check('Preferred regex accepted by Chromium',regex.isSupported,{version,...regex});
 await w.evaluate(async()=>{await Settings.setPreferredTsHost('rating.pecheny.ru');await updateRedirectRules();});
 let rules=await w.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules());
 check('Preferred selection installs three redirect rules',rules.filter(r=>r.action.type==='redirect').length===3,rules);
 await w.evaluate(async()=>{await Settings.setPreferredTsHost('off');await updateRedirectRules();});
 // Actual extension and browser APIs, but synthetic site responses: no live login/account.
 await c.route('https://**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/bounce-login')return route.fulfill({status:302,headers:{location:'https://rating.chgk.info/login'}});if(u.pathname==='/logout')return route.fulfill({status:302,headers:{location:'/'}});if(u.pathname==='/network-error')return route.abort('namenotresolved');if(u.pathname==='/aborted')return route.abort('aborted');return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Audit fixture</title><h1>Fixture</h1>'});});
 const source=await c.newPage(),popup=await c.newPage();
 await source.goto('https://rating.chgk.info/players/123/statistics?role=narrator#row');
 await popup.goto(base+'/popup.html');await source.bringToFront();await popup.evaluate(()=>refreshPopup());
 let state=await popup.evaluate(()=>({currentHost,currentPath,switchCount:document.querySelectorAll('#switch-ts-buttons button,#switch-rating-buttons button').length,copyCount:document.querySelectorAll('.copy-row button').length,copyTitle:document.querySelector('#copy-ts-row button')?.title}));
 check('Player popup has ten switches and eleven copy buttons',state.switchCount===10&&state.copyCount===11,state);
 check('Copy current host retains fragment',state.copyTitle?.endsWith('#row'),state.copyTitle);
 const titles=await popup.locator('#copy-rating-row button').evaluateAll(nodes=>nodes.map(n=>n.title));
 check('Rating links use canonical entity paths',JSON.stringify(titles)===JSON.stringify(['https://rating.chgk.gg/b/player/123/','https://rating.chgk.fun/player/123','https://chgk.quest/player/123','https://elo-chgk.uk/players/123','https://a2.pecheny.me/players/123/','https://a2.pecheny.kz/players/123/','https://a2.pecheny.ru/players/123/']),titles);
 await source.goto('https://rating.chgk.info/tournaments/13362');await popup.evaluate(()=>refreshPopup());
 await popup.waitForFunction(()=>currentPath==='/tournaments/13362'&&!refreshInFlight&&!refreshQueued);
 const tournamentLinks=await popup.locator('#switch-rating-buttons button').evaluateAll(nodes=>nodes.map(n=>n.title));
 check('Plural tournament route shows all rating switches',JSON.stringify(tournamentLinks)===JSON.stringify(['https://rating.chgk.gg/b/tournament/13362/','https://rating.chgk.fun/tournament/13362','https://chgk.quest/tournament/13362','https://elo-chgk.uk/tournaments/13362','https://a2.pecheny.me/tournaments/13362/','https://a2.pecheny.kz/tournaments/13362/','https://a2.pecheny.ru/tournaments/13362/']),tournamentLinks);
 const tournamentCopies=await popup.locator('#copy-rating-row button').evaluateAll(nodes=>nodes.map(n=>n.title));
 check('Plural tournament route shows all rating copies',JSON.stringify(tournamentCopies)===JSON.stringify(tournamentLinks),tournamentCopies);
 await popup.locator('#switch-rating-buttons button').first().click();await source.waitForURL('https://rating.chgk.gg/b/tournament/13362/');
 check('Tournament switch navigates to the same tournament',source.url()==='https://rating.chgk.gg/b/tournament/13362/',source.url());
 await source.goto('https://rating.chgk.info/teams/49804');await popup.evaluate(()=>refreshPopup());
 await popup.waitForFunction(()=>currentPath==='/teams/49804'&&!refreshInFlight&&!refreshQueued);
 const grid=await popup.locator('#copy-rating-row').evaluate(row=>({cols:getComputedStyle(row).gridTemplateColumns.split(' ').length,fit:Array.from(row.children).every(b=>b.scrollWidth<=b.clientWidth)}));
 check('Seven rating copy buttons fit the popup',grid.cols===7&&grid.fit,grid);
 await popup.locator('#switch-rating-section').screenshot({path:path.join(root,'tests','audit-a2-row.out.png')});
 await popup.locator('#switch-rating-buttons button').filter({hasText:'a2.me'}).click();await source.waitForURL('https://a2.pecheny.me/teams/49804/');
 check('TS team switches to A2 with the same ID',source.url()==='https://a2.pecheny.me/teams/49804/',source.url());
 await popup.evaluate(()=>refreshPopup());await popup.waitForFunction(()=>currentHost==='a2.pecheny.me'&&!refreshInFlight&&!refreshQueued);
 await popup.locator('#switch-ts-buttons button').first().click();await source.waitForURL('https://rating.chgk.info/teams/49804/');
 check('A2 switches back to the same TS team',source.url()==='https://rating.chgk.info/teams/49804/',source.url());
 await source.goto('https://a2.pecheny.me/releases/561/');await popup.evaluate(()=>refreshPopup());
 await popup.waitForFunction(()=>currentPath==='/releases/561/'&&!refreshInFlight&&!refreshQueued);
 const archive=await popup.evaluate(()=>({switches:document.querySelectorAll('#switch-ts-buttons button,#switch-rating-buttons button').length,copies:Array.from(document.querySelectorAll('.copy-row button')).map(b=>b.title)}));
 check('A2 release offers only its mirrors',archive.switches===2&&JSON.stringify(archive.copies)===JSON.stringify(['https://a2.pecheny.me/releases/561/','https://a2.pecheny.kz/releases/561/','https://a2.pecheny.ru/releases/561/']),archive);
 await popup.screenshot({path:path.join(root,'tests','audit-a2.out.png'),fullPage:true});
 await source.goto('https://rating.pecheny.me/venues/5508?x=1');await popup.evaluate(()=>refreshPopup());
 state=await popup.evaluate(()=>({switchCount:document.querySelectorAll('#switch-ts-buttons button,#switch-rating-buttons button').length,copyCount:document.querySelectorAll('.copy-row button').length}));
 check('Unknown TS path offers only TS hosts',state.switchCount===3&&state.copyCount===4,state);
 await popup.evaluate(()=>navigateToHost('rating.pecheny.kz'));await source.waitForURL('https://rating.pecheny.kz/venues/5508?x=1');
 check('Switch keeps path/query and removes bypass marker',source.url()==='https://rating.pecheny.kz/venues/5508?x=1',source.url());
 await popup.evaluate(()=>refreshPopup());const tabId=await popup.evaluate(()=>currentTabId);
 await source.goto('https://rating.pecheny.kz/network-error').catch(()=>{});await source.waitForTimeout(300);await popup.evaluate(()=>refreshPopup());await popup.waitForFunction(()=>document.querySelectorAll('.fallback-btn').length===3);
 const before=await popup.locator('.fallback-btn').count();await w.evaluate(()=>Settings.save({visibleSwitchHosts:{'rating.pecheny.me':false}}));await popup.evaluate(()=>refreshPopup());
 await popup.waitForFunction(()=>document.querySelectorAll('.fallback-btn').length===2);const after=await popup.locator('.fallback-btn').count();check('Fallback updates host visibility',after===before-1,{before,after});
 await w.evaluate(()=>Settings.save({visibleSwitchHosts:{'rating.pecheny.me':true}}));
 await source.goto('https://rating.pecheny.kz/login?ts_switcher_direct=1');await source.waitForTimeout(200);
 rules=await w.evaluate(()=>chrome.declarativeNetRequest.getSessionRules());check('Login installs grace',rules.some(r=>r.condition.tabIds?.includes(tabId)),rules);
 await source.goto('https://rating.pecheny.kz/logout');await source.waitForTimeout(200);
 rules=await w.evaluate(()=>chrome.declarativeNetRequest.getSessionRules());check('HTTP redirect logout clears grace',!rules.some(r=>r.condition.tabIds?.includes(tabId)),{url:source.url(),rules});
 await source.goto('https://rating.pecheny.kz/login?ts_switcher_direct=1');await source.waitForTimeout(200);await source.close();await popup.waitForTimeout(200);rules=await w.evaluate(()=>chrome.declarativeNetRequest.getSessionRules());check('Closing tab clears session grace',!rules.some(r=>r.condition.tabIds?.includes(tabId)),rules);
 await w.evaluate(()=>{globalThis.auditEvents=[];chrome.webNavigation.onErrorOccurred.addListener(d=>auditEvents.push({event:'error',...d}));chrome.tabs.onUpdated.addListener((id,change,tab)=>auditEvents.push({event:'tab',id,change,url:tab.url}));chrome.storage.onChanged.addListener((changes,area)=>{if(changes.loadFallbacks)auditEvents.push({event:'storage',area,changes});});});
 for(const route of ['network-error','aborted']){const page=await c.newPage();await page.goto('https://rating.chgk.info/'+route).catch(()=>{});await page.waitForTimeout(300);const entries=await w.evaluate(async()=>(await chrome.storage.session.get('loadFallbacks')).loadFallbacks||{});const found=Object.values(entries).some(e=>e.url==='https://rating.chgk.info/'+route);check(route==='network-error'?'DNS failure creates fallback':'Cancelled navigation does not create fallback',route==='network-error'?found:!found,{found,entries,events:await w.evaluate(()=>auditEvents)});await page.close();}

 // Actual navigations: DNR and one-shot bypass must affect the browser, not just rule JSON.
 const routing=await c.newPage();await routing.bringToFront();
 await w.evaluate(async()=>{await Settings.setPreferredTsHost('rating.pecheny.ru');await updateRedirectRules();});
 await routing.goto('https://rating.pecheny.me/venues/5508?x=2#row');
 check('Preferred actually redirects arbitrary TS paths',routing.url()==='https://rating.pecheny.ru/venues/5508?x=2#row',routing.url());
 await popup.evaluate(()=>refreshPopup());await popup.waitForFunction(()=>currentHost==='rating.pecheny.ru');
 await popup.evaluate(()=>navigateToHost('rating.pecheny.kz'));
 await routing.waitForURL('https://rating.pecheny.kz/venues/5508?x=2#row');
 check('Explicit popup switch bypasses preferred once',routing.url()==='https://rating.pecheny.kz/venues/5508?x=2#row',routing.url());
 check('Popup switch leaves preferred unchanged',(await w.evaluate(()=>Settings.load())).preferredTsHost==='rating.pecheny.ru');
 await routing.goto('https://rating.pecheny.me/venues/5509');
 check('Next navigation immediately uses preferred',routing.url()==='https://rating.pecheny.ru/venues/5509',routing.url());
 await routing.goto('https://rating.pecheny.me/venues/5509?ts_switcher_direct=10');
 check('Bypass requires value exactly one',routing.url().startsWith('https://rating.pecheny.ru/'),routing.url());
 await routing.goto('https://rating.pecheny.me/login?ts_switcher_direct=1');
 await routing.waitForTimeout(100);
 check('Explicit login stays on selected mirror',routing.url()==='https://rating.pecheny.me/login',routing.url());
 await routing.goto('https://rating.pecheny.me/players/42');
 check('Login grace keeps subsequent mirror navigation',routing.url()==='https://rating.pecheny.me/players/42',routing.url());
 await w.evaluate(async()=>{await Settings.save({preferredA2Host:'a2.pecheny.kz'});await updateRedirectRules();});
 await routing.goto('https://a2.pecheny.me/releases/561/?x=2#team');
 check('A2 redirects during TS login grace with full route',routing.url()==='https://a2.pecheny.kz/releases/561/?x=2#team',routing.url());
 await popup.evaluate(()=>refreshPopup());await popup.waitForFunction(()=>currentHost==='a2.pecheny.kz'&&!refreshInFlight&&!refreshQueued);
 await popup.evaluate(()=>navigateToHost('a2.pecheny.ru'));
 await routing.waitForURL('https://a2.pecheny.ru/releases/561/?x=2#team');
 check('Explicit A2 switch bypasses preferred and cleans marker',routing.url()==='https://a2.pecheny.ru/releases/561/?x=2#team',routing.url());
 check('A2 switch keeps independent preferences',(await w.evaluate(()=>Settings.load())).preferredA2Host==='a2.pecheny.kz');
 await routing.goto('https://a2.pecheny.ru/method/');
 check('Next A2 navigation uses preferred again',routing.url()==='https://a2.pecheny.kz/method/',routing.url());
 await routing.goto('https://rating.chgk.gg/b/player/42/');
 check('A2 preference does not redirect other ratings',routing.url()==='https://rating.chgk.gg/b/player/42/',routing.url());
 await w.evaluate(async()=>{await Settings.save({preferredA2Host:'off'});await updateRedirectRules();});
 await routing.goto('https://a2.pecheny.me/method/');
 check('Disabling A2 preference removes interception',routing.url()==='https://a2.pecheny.me/method/',routing.url());
 await routing.goto('https://rating.pecheny.me/logout');
 await routing.goto('https://rating.pecheny.me/players/43');
 check('Preferred resumes after redirecting logout',routing.url()==='https://rating.pecheny.ru/players/43',routing.url());
 await w.evaluate(async()=>{await Settings.setPreferredTsHost('off');await updateRedirectRules();});
 const hosts=['rating.chgk.info','rating.pecheny.me','rating.pecheny.kz','rating.pecheny.ru','rating.chgk.gg','rating.chgk.fun','chgk.quest','elo-chgk.uk','a2.pecheny.me','a2.pecheny.kz','a2.pecheny.ru'];
 for(const host of hosts){
   const player=host.startsWith('a2.pecheny.')?'/players/123/':host==='rating.chgk.gg'?'/b/player/123/':host==='rating.chgk.fun'||host==='chgk.quest'?'/player/123':'/players/123';
   await routing.goto('https://'+host+player);await popup.evaluate(()=>refreshPopup());
   await popup.waitForFunction(host=>currentHost===host,host);
   const counts=await popup.evaluate(()=>({switches:document.querySelectorAll('#switch-ts-buttons button,#switch-rating-buttons button').length,copies:document.querySelectorAll('.copy-row button').length}));
   check('Player UI on '+host,counts.switches===10&&counts.copies===11,counts);
 }

 await routing.goto('https://rating.pecheny.me/players/123');
 await routing.goto('https://rating.pecheny.me/bounce-login').catch(()=>{});await routing.waitForTimeout(300);
 check('Server redirect to info login returns to last mirror when preferred off',routing.url()==='https://rating.pecheny.me/login',routing.url());

 await routing.goto('https://rating.pecheny.me/logout');
 await w.evaluate(async()=>{await Settings.setPreferredTsHost('rating.pecheny.ru');await updateRedirectRules();});
 await routing.goto('https://rating.pecheny.me/bounce-login').catch(()=>{});await routing.waitForTimeout(300);
 check('Server redirect to info login follows preferred mirror',routing.url()==='https://rating.pecheny.ru/login',routing.url());
 await w.evaluate(async()=>{await Settings.setPreferredTsHost('off');await updateRedirectRules();});
 await routing.close();
 const options=await c.newPage();await options.goto(base+'/options.html');await options.locator('#opt-preferred').selectOption('rating.pecheny.ru');await options.getByText('Сохранено',{exact:true}).waitFor();const saved=await w.evaluate(()=>Settings.load());check('Options persists preferred host',saved.preferredTsHost==='rating.pecheny.ru',saved.preferredTsHost);
 await w.evaluate(()=>Settings.setPreferredTsHost('rating.pecheny.me'));await options.locator('#opt-fallback').uncheck();await options.waitForTimeout(500);const newer=await w.evaluate(()=>Settings.load());check('Existing options preserves preferred changed elsewhere',newer.preferredTsHost==='rating.pecheny.me',newer);

 await options.locator('#opt-preferred-a2').selectOption('a2.pecheny.ru');
 await options.waitForFunction(()=>document.getElementById('save-status').textContent==='Сохранено'&&pendingSaves===0);
 check('Options persists independent A2 preference',(await w.evaluate(()=>Settings.load())).preferredA2Host==='a2.pecheny.ru');
 // Two extension contexts update independent settings at the same time.
 await Promise.all([popup.evaluate(()=>Settings.save({fallbackOnError:true})),options.evaluate(()=>Settings.setPreferredTsHost('rating.pecheny.kz'))]);
 const parallel=await w.evaluate(()=>Settings.load());
 check('Concurrent UI writes preserve both changes',parallel.fallbackOnError===true&&parallel.preferredTsHost==='rating.pecheny.kz',parallel);
 await Promise.all([popup.evaluate(()=>Settings.setFallbackForTab(8001,{failedHost:'rating.pecheny.me',path:'/1'})),options.evaluate(()=>Settings.setFallbackForTab(8002,{failedHost:'rating.pecheny.kz',path:'/2'}))]);
 const fallbacks=await w.evaluate(async()=>({one:await Settings.getFallbackForTab(8001),two:await Settings.getFallbackForTab(8002)}));
 check('Concurrent fallback writes preserve both tabs',!!fallbacks.one&&!!fallbacks.two,fallbacks);
 await w.evaluate(async()=>{await Settings.clearFallbackForTab(8001);await Settings.clearFallbackForTab(8002);});
 check('Extension console has no errors',errors.length===0,errors);
 await options.screenshot({path:path.join(root,'tests','audit-options.out.png'),fullPage:true});
 fs.writeFileSync(path.join(root,'tests','audit-browser.out.json'),JSON.stringify({version,results,errors},null,2)+'\n');
 }finally{await c.close();}
 process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
