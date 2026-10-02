// Real Chromium with extension and synthetic site pages. No user profile or account.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const c=await chromium.launchPersistentContext('',{executablePath:process.env.CHROMIUM_PATH,channel:process.env.CHROMIUM_PATH?undefined:'chromium',headless:true,args:['--disable-extensions-except='+path.join(root,'src'),'--load-extension='+path.join(root,'src')]});
 let checks=0;const shots=[];
 try{
 const worker=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');
 const base=worker.url().replace('/background.js','');
 await worker.evaluate(()=>bootstrap());
 await c.route('https://**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-site-theme="classic" data-bs-theme="light"><body>Theme fixture</body></html>'}));
 const source=await c.newPage(),popup=await c.newPage();
 const errors=[];popup.on('pageerror',e=>errors.push(e.message));await popup.setViewportSize({width:320,height:650});
 await source.goto('https://rating.chgk.info/teams/42');
 await popup.goto(base+'/popup.html');await source.bringToFront();await popup.evaluate(()=>refreshPopup());
 async function state(group,family,scheme,contrast='normal'){
  await popup.waitForFunction(w=>{const d=document.documentElement.dataset;return d.themeGroup===w[0]&&d.siteTheme===w[1]&&d.bsTheme===w[2]&&d.contrast===w[3];},[group,family,scheme,contrast]);checks++;
 }
 async function save(settings){await worker.evaluate(s=>Settings.save(s),settings);await popup.evaluate(()=>refreshPopup());}
 async function screenshot(label){shots.push({label,data:(await popup.screenshot({fullPage:true})).toString('base64')});}
 await state('ts','classic','light');
 assert.equal(await popup.evaluate(async()=>{const faces=await document.fonts.load('400 12px "Noto Sans"','Турнирный TS');return faces.length===1&&faces[0].status==='loaded'&&['body','.switch-btn','.toolbar-select'].every(s=>getComputedStyle(document.querySelector(s)).fontFamily.includes('Noto Sans'));}),true);checks++;
 await popup.evaluate(()=>window.originalButton=document.querySelector('.switch-btn'));
 for(const family of ['classic','oldschool','catppuccin'])for(const scheme of ['light','dark']){
  await source.evaluate(({family,scheme})=>{document.documentElement.dataset.siteTheme=family;document.documentElement.dataset.bsTheme=scheme;},{family,scheme});
  await state('ts',family,scheme);
  assert.equal(await popup.evaluate(()=>window.originalButton===document.querySelector('.switch-btn')),true);checks++;
  // Verify actual normal text/background pairs, not just data attributes.
  const pairs=await popup.evaluate(()=>['.header','#current-site','.toolbar-label','h3','.switch-btn','.copy-btn-ts','.copy-btn-rating','.toolbar-select'].map(sel=>{
   const el=document.querySelector(sel),style=getComputedStyle(el);let parent=el,bg=style.backgroundColor;
   while(bg==='rgba(0, 0, 0, 0)'&&parent.parentElement){parent=parent.parentElement;bg=getComputedStyle(parent).backgroundColor;}
   return {sel,fg:style.color,bg};
  }));
  const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  for(const pair of pairs){const a=lum(pair.fg),b=lum(pair.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,`${family}/${scheme} ${pair.sel}: ${ratio}`);checks++;}
  await screenshot(family+' '+scheme);
 }
 await save({tsTheme:'oldschool',tsColorScheme:'light',tsContrast:'more'});await state('ts','oldschool','light','more');assert.equal(await popup.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');checks++;await screenshot('Контраст — светлый');
 await save({tsColorScheme:'dark'});await state('ts','oldschool','dark','more');assert.equal(await popup.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(0, 0, 0)');checks++;await screenshot('Контраст — тёмный');
 await save({tsTheme:'auto',tsColorScheme:'auto',tsContrast:'auto'});
 await popup.emulateMedia({contrast:'more'});await state('ts','catppuccin','dark','normal');
 // gg must follow the source tab even if popup media is different.
 await source.emulateMedia({colorScheme:'dark'});await popup.emulateMedia({colorScheme:'light'});
 await source.goto('https://rating.chgk.gg/b/team/42/');await popup.evaluate(()=>refreshPopup());await state('rating','rating','dark');
 const tsCopyColors={classic:{light:'rgb(193, 178, 131)',dark:'rgb(65, 58, 43)'},oldschool:{light:'rgb(172, 179, 189)',dark:'rgb(53, 59, 68)'},catppuccin:{light:'rgb(173, 179, 192)',dark:'rgb(55, 56, 77)'}};
 const tsCopyBorders={classic:{light:'rgb(160, 147, 107)',dark:'rgb(99, 90, 68)'},oldschool:{light:'rgb(140, 148, 159)',dark:'rgb(84, 91, 101)'},catppuccin:{light:'rgb(142, 147, 165)',dark:'rgb(85, 89, 115)'}};
 for(const family of Object.keys(tsCopyColors))for(const scheme of ['light','dark']){
  await save({tsTheme:family,tsColorScheme:scheme});
  const actual=await popup.evaluate(()=>({copy:getComputedStyle(document.querySelector('.copy-btn-ts')).backgroundColor,body:getComputedStyle(document.body).backgroundColor,border:getComputedStyle(document.querySelector('.copy-btn-ts')).borderTopColor}));
  assert.deepEqual(actual,{copy:tsCopyColors[family][scheme],body:'rgb(17, 24, 39)',border:tsCopyBorders[family][scheme]});checks++;
 }
 await save({tsContrast:'more'});
 assert.equal(await popup.evaluate(()=>getComputedStyle(document.querySelector('.copy-btn-ts')).backgroundColor),'rgb(0, 0, 0)');checks++;
 await save({tsTheme:'auto',tsColorScheme:'auto',tsContrast:'auto'});
 assert.equal(await popup.evaluate(()=>getComputedStyle(document.querySelector('.copy-btn-ts')).backgroundColor),tsCopyColors.classic.light);checks++;
 await screenshot('Рейтинг — тёмный');
 await source.emulateMedia({colorScheme:'light'});await state('rating','rating','light');await screenshot('Рейтинг — светлый');
 for(const host of ['rating.chgk.fun','chgk.quest','elo-chgk.uk']){
  await source.goto('https://'+host+'/');await popup.emulateMedia({colorScheme:'dark'});await popup.evaluate(()=>refreshPopup());await state('rating','rating','dark');
 }
 await save({ratingColorScheme:'light'});await state('rating','rating','light');
 const second=await c.newPage();await second.goto('https://rating.chgk.info/teams/42');
 await second.evaluate(()=>{document.documentElement.dataset.siteTheme='oldschool';document.documentElement.dataset.bsTheme='dark';});
 await second.bringToFront();await popup.evaluate(()=>refreshPopup());await state('ts','oldschool','dark');
 // Missing content script is a valid fallback (removed receiver via new blank tab).
 await second.goto('about:blank');await popup.evaluate(()=>refreshPopup());await popup.waitForFunction(()=>document.documentElement.dataset.themeGroup==='other');checks++;
 // Actual options controls persist all four fields through the background.
 const options=await c.newPage();await options.goto(base+'/options.html');
 assert.equal(await options.evaluate(async()=>{const faces=await document.fonts.load('700 14px "Noto Sans"','Настройки TS');return faces.length===1&&faces[0].status==='loaded'&&['body','select'].every(s=>getComputedStyle(document.querySelector(s)).fontFamily.includes('Noto Sans'));}),true);checks++;
 for(const [id,key,value] of [['opt-ts-scheme','tsColorScheme','light'],['opt-ts-theme','tsTheme','catppuccin'],['opt-ts-contrast','tsContrast','more'],['opt-rating-scheme','ratingColorScheme','dark']]){
  await options.selectOption('#'+id,value);await options.waitForFunction(({key,value})=>Settings.load().then(s=>s[key]===value),{key,value});checks++;
 }
 assert.equal(await options.locator('option[value=colorblind]').evaluate(el=>el.disabled),true);checks++;
 async function optionsState(group,family,scheme,contrast='normal'){
  await options.waitForFunction(w=>{const d=document.documentElement.dataset;return d.themeGroup===w[0]&&d.siteTheme===w[1]&&d.bsTheme===w[2]&&d.contrast===w[3];},[group,family,scheme,contrast]);checks++;
 }
 await optionsState('rating','rating','dark');
 assert.equal(await options.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(17, 24, 39)');checks++;
 await second.goto('https://rating.chgk.info/teams/42');await second.bringToFront();
 await optionsState('ts','catppuccin','light','more');
 assert.equal(await options.evaluate(()=>getComputedStyle(document.querySelector('.card')).backgroundColor),'rgb(255, 255, 255)');checks++;
 await options.bringToFront();
 await options.selectOption('#opt-ts-contrast','normal');
 for(const family of ['classic','oldschool','catppuccin'])for(const scheme of ['light','dark']){
  await options.selectOption('#opt-ts-theme',family);await options.selectOption('#opt-ts-scheme',scheme);
  await optionsState('ts',family,scheme);
  assert.equal(await options.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),scheme);checks++;
 }
 await options.selectOption('#opt-ts-contrast','more');await optionsState('ts','catppuccin','dark','more');
 assert.equal(await options.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(0, 0, 0)');checks++;
 // External changes and automatic page updates also recolor the settings page.
 await worker.evaluate(()=>Settings.save({tsTheme:'auto',tsColorScheme:'auto',tsContrast:'auto'}));
 await second.evaluate(()=>{document.documentElement.dataset.siteTheme='oldschool';document.documentElement.dataset.bsTheme='dark';});
 await optionsState('ts','oldschool','dark');
 await second.evaluate(()=>{document.documentElement.dataset.siteTheme='catppuccin';document.documentElement.dataset.bsTheme='light';});
 await optionsState('ts','catppuccin','light');
 await source.close();await second.close();await options.emulateMedia({colorScheme:'dark'});
 await optionsState('ts','classic','dark');
 await options.selectOption('#opt-ts-theme','catppuccin');await optionsState('ts','catppuccin','dark');
 await options.screenshot({path:path.join(__dirname,'audit-themes-options.out.png'),fullPage:true});
 // Render a contact sheet of the actual popup screenshots for visual review.
 const sheet=await c.newPage();await sheet.setViewportSize({width:1400,height:1500});
 await sheet.setContent('<html><body style="margin:20px;background:#ddd;font:16px sans-serif;display:grid;grid-template-columns:repeat(4,320px);gap:20px">'+shots.map(s=>'<section><p>'+s.label+'</p><img width="320" src="data:image/png;base64,'+s.data+'"></section>').join('')+'</body></html>');
 await sheet.screenshot({path:path.join(__dirname,'audit-themes.out.png'),fullPage:true});
 assert.deepEqual(errors,[]);checks++;
 console.log(JSON.stringify({browser:c.browser().version(),checks,status:'passed'}));
 }finally{await c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
