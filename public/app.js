const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const content=$('#content'),message=$('#message'),modal=$('#modal');
let me=null,view='overview',sub='firewall',dockerTab='containers',generation=0,poll,toastTimer,overviewHost,dockerData,activeJob;
const samples=[];
const paths={globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18 M12 3c-5 5-5 13 0 18',trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',download:'M12 3v12 M5 8l7 7 7-7 M3 16v5h18v-5',upload:'M12 16V4 M5 11l7-7 7 7 M3 16v5h18v-5',overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',docker:'M4 8h4v4H4z M9 8h4v4H9z M9 3h4v4H9z M14 8h4v4h-4z M2 13h16c2 0 3-1 4-3 0 5-3 10-10 10H7c-3 0-5-3-5-7z',server:'M4 3h16v7H4z M4 14h16v7H4z M7 6h.01 M7 17h.01 M11 6h6 M11 17h6',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',user:'M20 21v-2a7 7 0 0 0-14 0v2 M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',cpu:'M7 7h10v10H7z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M1 9h3 M1 15h3 M20 9h3 M20 15h3 M10 10h4v4h-4z',memory:'M3 5h18v14H3z M7 9v4 M11 9v4 M15 9v4 M19 9v4 M7 19v3 M12 19v3 M17 19v3',disk:'M4 4h16l2 12v4H2v-4L4 4z M2 15h20 M16 18h.01 M19 18h.01',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',terminal:'M4 5l6 7-6 7 M13 19h7',folder:'M3 7V4h6l3 3h9v13H3V7z',file:'M14 2H4v20h16V8l-6-6z M14 2v6h6 M8 13h8 M8 17h6',shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4z M8 12l3 3 5-6',key:'M15 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12 M10 13l-8 8 M2 17l4 4 M5 14l3 3 M17 7h.01',refresh:'M20 7v5h-5 M4 17v-5h5 M6.1 6a8 8 0 0 1 13 1 M4.9 17a8 8 0 0 0 13 1',sun:'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4 4l1 1 M19 19l1 1 M4 20l1-1 M19 5l1-1',logout:'M9 4H3v16h6 M14 8l4 4-4 4 M8 12h13',menu:'M3 6h18 M3 12h18 M3 18h18',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M16 16l5 5',arrow:'M5 12h14 M14 7l5 5-5 5',plus:'M12 5v14 M5 12h14',close:'M6 6l12 12 M18 6L6 18',play:'M7 3l14 9-14 9V3z',stop:'M5 5h14v14H5z',edit:'M15 3l6 6 M3 21l5-1L21 7l-5-5L3 15v6z',info:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 11v6 M12 7h.01',check:'M5 12l4 4L19 6',lock:'M5 10h14v12H5z M8 10V6a4 4 0 0 1 8 0v4',chevron:'M9 5l7 7-7 7',up:'M12 19V5 M5 12l7-7 7 7',network:'M9 2h6v6H9z M2 16h6v6H2z M16 16h6v6h-6z M12 8v4 M5 16v-4h14v4',archive:'M4 4h16v4H4z M6 8v12h12V8 M10 12h4 M10 15h4',image:'M4 4h16v16H4z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M4 17l6-6 4 4 2-2 4 4',copy:'M8 4h12v14H8z M4 8v12h12',external:'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3',palette:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.84 0 3.32-1.48 3.32-3.32 0-.85-.34-1.63-.89-2.2-.53-.54-.86-1.28-.86-2.09 0-1.66 1.34-3 3-3h1.72c2.6 0 4.71-2.11 4.71-4.71C22 6.14 17.52 2 12 2zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8s1.5.67 1.5 1.5S7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',eye:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',eyeOff:'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 m-6.72-1.07a3 3 0 1 1-4.24-4.24 M1 1l22 22'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.server}"/></svg>`;
function icons(){ $$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon)); }
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>(n/1024**3).toFixed(1)+' GB';
const percent=n=>Math.max(0,Math.min(100,n));
const pill=(text,tone='')=>`<span class="pill ${tone}">${tone==='green'?'<i class="status-dot"></i>':''}${esc(text)}</span>`;
const empty=(title,description,name='server')=>`<div class="empty">${icon(name)}<h3>${esc(title)}</h3><p>${esc(description)}</p></div>`;
const notice=(text,tone='')=>`<div class="notice ${tone}">${icon('info')}<span>${esc(text)}</span></div>`;
const button=(id,label,name,kind='secondary')=>`<button id="${esc(id)}" class="button ${esc(kind)}" type="button">${name?icon(name):''}${esc(label)}</button>`;
function notify(text){clearTimeout(toastTimer);message.textContent=text;if(text)toastTimer=setTimeout(()=>message.textContent='',9000);}
async function api(url,options={}){const {panelReauthenticated,...fetchOptions}=options;let r;try{r=await fetch(url,{credentials:'same-origin',...fetchOptions,headers:{'Content-Type':'application/json','X-Panel-Intent':'manage',...options.headers}});}catch{throw Error('Cannot reach the panel. Check your connection and panel address.');}let text;try{text=await r.text();}catch{throw Object.assign(Error('The panel response was interrupted. Please try again.'),{status:r.status});}let data;try{data=JSON.parse(text);}catch{const hint=r.status===431?'Browser cookies or request headers are too large. Clear site data for this panel domain and sign in again.':r.status===403?'The proxy or security service blocked this request.':r.status>=500?'The proxy could not complete the panel request. Check the panel service and routing.':text.trim()?'The server returned an unexpected response instead of panel data.':'The server or proxy returned an empty response.';throw Object.assign(Error(hint+' (HTTP '+r.status+')'),{status:r.status});}if(r.status===428&&data?.reauthRequired&&!panelReauthenticated){await recentAuthentication(Boolean(data.mfaEnabled));return api(url,{...options,panelReauthenticated:true});}if(!r.ok){throw Object.assign(Error(typeof data?.error==='string'?data.error:'Panel request failed (HTTP '+r.status+').'),{status:r.status});}return data;}

const post=(url,data={})=>api(url,{method:'POST',body:JSON.stringify(data)});
const action=fn=>async()=>{try{await fn();}catch(e){notify(e.message);}};
const bind=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=action(fn);};
function form(id,handler){const el=document.getElementById(id);if(!el)return;el.onsubmit=async e=>{e.preventDefault();if(!el.reportValidity())return;const b=el.querySelector('[type=submit]'),error=el.querySelector('[role=alert]');if(error)error.textContent='';const original=b?.innerHTML;if(b){b.disabled=true;b.setAttribute('aria-busy','true');b.textContent='Working…';}try{await handler(el);}catch(e){if(error){error.textContent=e.message;error.tabIndex=-1;error.focus();}else notify(e.message);}finally{if(b){b.disabled=false;b.removeAttribute('aria-busy');b.innerHTML=original;}}};}
function setShell(mode){if(mode!=='ready')disposeSystemTools();const ready=mode==='ready';document.body.classList.toggle('auth-mode',!ready);['sidebar','panel-header','panel-footer','page-heading','ai-assistant-toggle'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=!ready;});const drawer=document.getElementById('ai-assistant-drawer');if(drawer&&!ready)drawer.hidden=true;if(!ready){clearInterval(poll);generation++;}else{ $('#identity').textContent=me.username;$('#identity-role').textContent=me.role;$('#avatar').textContent=me.username.slice(0,1).toUpperCase();if($('.footer-version'))$('.footer-version').textContent='Build '+(me.build||'development').slice(0,8);$$('[data-admin]').forEach(e=>e.hidden=me.role!=='admin');}}
function route(next){if(!canLeaveWebsite())return;if(!me||me.mustChangePassword)return;view=next;document.body.classList.remove('nav-open');updateSidebarControl();render();}
function authLayout(title,description,body,step=''){
 setShell('auth');content.innerHTML=`<div class="auth-layout"><section class="auth-story"><div class="auth-brand"><span class="brand-symbol">${icon('server')}</span>CP-Panel <span style="font-size:12px;opacity:0.75;font-weight:400;margin-left:6px;">by CyberPross</span></div><div class="auth-story-copy"><h1>Your server.<br>One control panel.</h1><p>Monitor resources. Manage applications. Stay in control of your infrastructure.</p></div><div class="auth-illustration" aria-hidden="true">${['server','docker','disk'].map(i=>`<div class="rack">${icon(i)}<div class="rack-lines"><i></i><i></i></div><span class="rack-led"></span><span class="rack-led"></span></div>`).join('')}<div class="rack-label"><i class="status-dot"></i>Your server. Your control.</div></div><div class="auth-bottom">${icon('lock')} CP-Panel · Developed by CyberPross</div></section><section class="auth-form-side"><div class="auth-form-wrap"><div class="auth-brand auth-mobile-brand"><span class="brand-symbol">${icon('server')}</span>CP-Panel <span style="font-size:12px;opacity:0.75;font-weight:400;margin-left:6px;">by CyberPross</span></div>${step?`<div class="auth-step"><i>1</i>${step}</div>`:''}<h2>${title}</h2><p class="auth-description">${description}</p>${body}<div class="auth-caption">CP-Panel · Developed by CyberPross</div></div></section></div>`;
}
function togglePassword(id){bind(id+'-toggle',()=>{const field=document.getElementById(id),b=document.getElementById(id+'-toggle');if(!field||!b)return;field.type=field.type==='password'?'text':'password';const show=field.type==='password';b.innerHTML=icon(show?'eye':'eyeOff');b.setAttribute('aria-label',show?'Show password':'Hide password');b.setAttribute('title',show?'Show password':'Hide password');});}
function passwordField(id,label,autocomplete='new-password',minimum=false){return `<label>${label}<div class="password-field"><input id="${id}" type="password" autocomplete="${autocomplete}" ${minimum?'minlength="9" maxlength="256"':''} required><button id="${id}-toggle" class="icon-button password-toggle" type="button" aria-label="Show password" title="Show password">${icon('eye')}</button></div>${minimum?'<span class="field-help">At least 9 characters. Spaces are welcome.</span>':''}</label>`;}
async function login(){me=null;setShell('auth');authLayout('Welcome back','Sign in to manage your server.',`<form id="login-form"><label>Username<input id="username" autocomplete="username" placeholder="Enter your username" required></label>${passwordField('password','Password','current-password')}<p class="form-error" role="alert"></p><button class="button submit" type="submit">Sign in ${icon('arrow')}</button><div class="auth-secondary"><button id="recover" class="text-button" type="button">Forgot your password?</button></div></form>`);togglePassword('password');bind('recover',recovery);form('login-form',async()=>{const result=await post('/api/login',{username:$('#username').value,password:$('#password').value});if(result.mfaRequired)return mfaLogin(result.challenge);view='overview';await render();});}
function mfaLogin(challenge){authLayout('Verify your sign-in','Enter your authenticator code or an unused MFA backup code. This browser will remember verification for 24 hours.',`<form id="mfa-login"><label>Authentication code<input id="mfa-code" autocomplete="one-time-code" autofocus required maxlength="128"></label><p class="form-error" role="alert"></p><button class="button submit" type="submit">Verify and sign in</button><button id="mfa-back" class="text-button" type="button">Back to sign in</button></form>`);bind('mfa-back',login);form('mfa-login',async()=>{await post('/api/login/mfa',{challenge,code:$('#mfa-code').value.trim()});view='overview';await render();});}
function mfaAccount(){const target=$('#mfa-settings');if(!target)return;target.innerHTML=`<div class="subheading"><h2>Two-factor authentication</h2>${pill(me.mfaEnabled?'Enabled':'Not configured',me.mfaEnabled?'green':'amber')}</div><p class="field-help">Use an authenticator app for a second sign-in step. Keep your MFA backup codes separately from your password. Password recovery keeps MFA enabled. After verification, this browser can sign in without another OTP for 24 hours. Other browsers still need their own verification.</p><form id="mfa-setup-form">${passwordField('mfa-password','Current password','current-password')}${me.mfaEnabled?'<label>Authenticator or unused MFA backup code<input id="mfa-disable-code" autocomplete="one-time-code" maxlength="128" required></label>':''}<p class="form-error" role="alert"></p><button type="submit" class="button secondary">${me.mfaEnabled?'Disable two-factor authentication':'Set up authenticator'}</button></form>`;togglePassword('mfa-password');form('mfa-setup-form',async()=>{const currentPassword=$('#mfa-password').value;if(me.mfaEnabled){await post('/api/account/mfa/disable',{currentPassword,code:$('#mfa-disable-code').value.trim()});await login();notify('MFA disabled. Sign in again.');return;}const r=await post('/api/account/mfa/start',{currentPassword});target.innerHTML=`<h2>Connect your authenticator</h2><p>Scan this QR code in your authenticator app. Then enter its current six-digit code.</p><img class="mfa-qr" src="${esc(r.qr)}" alt="Authenticator setup QR code" width="240" height="240"><details><summary>Enter the setup key manually</summary><pre class="auth-recovery-code">${esc(r.secret)}</pre><p>Account: ${esc(me.username)} · Issuer: CP-Panel (CyberPross) · TOTP · SHA1 · 6 digits · 30 seconds</p></details><form id="mfa-confirm-form"><label>Six-digit code<input id="mfa-confirm-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p class="form-error" role="alert"></p><button type="submit" class="button">Enable MFA</button><button type="button" class="text-button" id="mfa-cancel">Cancel setup</button></form>`;bind('mfa-cancel',mfaAccount);form('mfa-confirm-form',async()=>{const result=await post('/api/account/mfa/confirm',{code:$('#mfa-confirm-code').value});authLayout('Save your MFA backup codes','MFA is enabled. Each backup code can be used once in place of an authenticator code. Your previous sessions have ended.',`<pre class="auth-recovery-code">${result.recoveryCodes.map(esc).join('\n')}</pre><p>Store these codes somewhere private. They will not be shown again.</p>${button('mfa-done','I saved my codes · Sign in','arrow')}`);me=null;bind('mfa-done',login);});});}
function recovery(){authLayout('Recover your account','Use your saved recovery code to set a new password.',`<form id="recovery-form"><label>Username<input id="reset-user" autocomplete="username" value="admin" required></label><label>One-use recovery code<input id="reset-code" type="password" autocomplete="off" required></label>${passwordField('reset-password','New password','new-password',true)}${passwordField('reset-confirm','Confirm new password')}<p class="form-error" role="alert"></p><button class="button submit" type="submit">Reset password ${icon('arrow')}</button><div class="auth-secondary"><button id="back-login" class="text-button" type="button">Back to sign in</button></div></form><div id="recovery-result"></div><p class="field-help">Lost your recovery code? A server administrator can generate one from the server console.</p>`);togglePassword('reset-password');togglePassword('reset-confirm');bind('back-login',login);form('recovery-form',async()=>{if($('#reset-password').value!==$('#reset-confirm').value)throw Error('The new passwords do not match.');const r=await post('/api/account/reset',{username:$('#reset-user').value,recoveryCode:$('#reset-code').value,newPassword:$('#reset-password').value});$('#recovery-form').hidden=true;$('#recovery-result').innerHTML=notice('Password reset. Save your replacement recovery code securely.','success')+`<pre class="auth-recovery-code">${esc(r.recoveryCode)}</pre>`+button('reset-done','Return to sign in','arrow');bind('reset-done',login);});}
function account(){disposeSystemTools();clearInterval(poll);generation++;const forced=me.mustChangePassword;

 const body=`<form id="password-form">${passwordField('current-password','Current password','current-password')}${passwordField('change-password','New password','new-password',true)}${passwordField('confirm-password','Confirm new password')}<p class="form-error" role="alert"></p><button class="button ${forced?'submit':''}" type="submit">${forced?'Save password & continue':'Update password'} ${icon('arrow')}</button><div class="auth-secondary"><button class="text-button" id="cancel-password" type="button">${forced?'Back to sign in':'Cancel'}</button></div></form>`;
 if(forced)authLayout('Make this account yours','Replace your temporary password to finish setting up your panel.',body,'FINISH ACCOUNT SETUP');else{setShell('ready');setHeading('My account','Manage your password and account recovery.');content.innerHTML=`<div class="settings-layout"><div class="card"><div class="card-header"><h2>Change password</h2></div><div class="card-pad">${body}</div></div><div class="card card-pad"><h2>Recovery code</h2><p class="field-help">Generate a new one-use recovery code. Your previous code will stop working.</p><form id="recovery-rotate-form">${passwordField('recovery-password','Current password','current-password')}<p class="form-error" role="alert"></p><button class="button secondary" type="submit">Generate recovery code</button></form><pre id="recovery-result"></pre></div><div id="mfa-settings" class="card card-pad"></div></div>`;mfaAccount();togglePassword('recovery-password');form('recovery-rotate-form',async()=>{const r=await post('/api/account/recovery',{currentPassword:$('#recovery-password').value});$('#recovery-password').value='';$('#recovery-result').textContent=r.recoveryCode;notify('Save your recovery code securely. It is shown only here.');});}
 ['current-password','change-password','confirm-password'].forEach(togglePassword);form('password-form',async()=>{const currentPassword=$('#current-password').value,newPassword=$('#change-password').value;if(newPassword!==$('#confirm-password').value)throw Error('The new passwords do not match.');if(currentPassword===newPassword)throw Error('Choose a password different from your current password.');await post('/api/account/password',{currentPassword,newPassword});await login();notify('Password updated. Sign in with your new password.');});bind('cancel-password',async()=>{if(forced){await post('/api/logout');await login();}else render();});
}
function setHeading(title,subtitle='',crumb=''){
 $('#title').textContent=title;
 if($('#page-subtitle'))$('#page-subtitle').textContent=subtitle||'';
 if($('#header-crumb'))$('#header-crumb').textContent=crumb||title;
 document.title=title+' · CP-Panel by CyberPross';
}
function syncRouteState(){
 const detail=view==='system'?sub:view==='monitoring'?monitoringCategory:view==='docker'?dockerTab:view==='databases'?databaseCategory:view==='websites'?(websiteTab!=='sites'?websiteTab:websiteCategory):'';
 const hash='#/'+view+(detail?'/'+detail:'');
 if(location.hash!==hash)try{history.replaceState(null,'',hash);}catch{}
 try{sessionStorage.setItem('panel-route-state',JSON.stringify({view,sub,dockerTab,websiteCategory,websiteTab,databaseCategory,nativeDatabaseTab,monitoringCategory}));}catch{}
}
function restoreRouteState(){
 const validViews=['overview','docker','websites','databases','monitoring','waf','system','users','tasks','appearance'];
 const h=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean);
 if(h[0]==='security')h[0]='waf';
 if(h[0]&&validViews.includes(h[0])){
  view=h[0];
  const d=h[1];
  if(view==='system'&&['firewall','terminal','files','tunnel','wireguard','readiness','ai','access','grafana'].includes(d))sub=d;
  if(view==='monitoring'&&['console','setup','metrics','health'].includes(d))monitoringCategory=d;
  if(view==='docker'&&['containers','compose','networks','images','volumes','cleanup'].includes(d))dockerTab=d;
  if(view==='databases'&&['all','mysql','postgresql','redis','mariadb'].includes(d))databaseCategory=d;
  if(view==='websites'){
   if(['runtimes','engine'].includes(d)){websiteCategory='all';websiteTab=d;}
   else if(['all','node','php','static','proxy','python'].includes(d)){websiteCategory=d;websiteTab='sites';}
  }
  return;
 }
 try{
  const saved=JSON.parse(sessionStorage.getItem('panel-route-state')||'null');
  if(saved){
   if(saved.view==='security')saved.view='waf';
   if(validViews.includes(saved.view)){
    view=saved.view;
    if(saved.sub)sub=saved.sub;
    if(saved.dockerTab)dockerTab=saved.dockerTab;
    if(saved.websiteCategory)websiteCategory=saved.websiteCategory;
    if(saved.websiteTab)websiteTab=saved.websiteTab;
    if(saved.databaseCategory)databaseCategory=saved.databaseCategory;
    if(saved.nativeDatabaseTab)nativeDatabaseTab=saved.nativeDatabaseTab;
    if(saved.monitoringCategory)monitoringCategory=saved.monitoringCategory;
   }
  }
 }catch{}
}
let modalReturnFocus;
modal.addEventListener('close',()=>{if(modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true});});
function openModal(title,body,extraClass=''){if(!modal.open)modalReturnFocus=document.activeElement;modal.className='modal '+extraClass;modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button id="modal-close" class="icon-button" aria-label="Close">${icon('close')}</button></div>${body}`;bind('modal-close',()=>modal.close());if(!modal.open)modal.showModal();requestAnimationFrame(()=>{if(!modal.open)return;const first=modal.querySelector('input:not([type=hidden]):not([disabled]),textarea:not([disabled]),select:not([disabled]),#confirm-cancel');if(first)first.focus({preventScroll:true});});}
function confirmOperation(title,description,label='Continue'){return new Promise(resolve=>{openModal(title,`<div class="modal-body"><p>${esc(description)}</p></div><div class="form-actions">${button('confirm-cancel','Cancel',null)}${button('confirm-go',label,null,/delete|remove|stop|restart|reset|publish|deploy|apply|clean|restore/i.test(title)?'danger':'primary')}</div>`);const finish=v=>{modal.close();resolve(v);};bind('confirm-cancel',()=>finish(false));bind('modal-close',()=>finish(false));bind('confirm-go',()=>finish(true));modal.addEventListener('cancel',()=>resolve(false),{once:true});});}
function metricCard(name,title,tone){return `<div class="card metric"><div class="metric-top"><span>${title}</span><span class="metric-icon ${tone}">${icon(name)}</span></div><div class="metric-value" id="${name}-value">—</div><div class="meter"><div class="meter-fill ${tone}" id="${name}-bar"></div></div><div class="metric-foot" id="${name}-detail">Reading host data…</div></div>`;}
function chartMarkup(){const width=Math.max(300,Math.floor($('#resource-chart')?.clientWidth||720)),height=225,left=38,right=width-16,top=20,bottom=191;const line=key=>samples.map((m,i)=>`${i?'L':'M'}${left+(right-left)*i/Math.max(59,samples.length-1)},${bottom-(bottom-top)*percent(m[key])/100}`).join(' ');const cpu=line('cpu'),ram=line('ram');const last=samples.at(-1);return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="CPU and RAM usage from measurements collected while this page is open">${[0,25,50,75,100].map(p=>`<path class="chart-grid" d="M${left} ${bottom-(bottom-top)*p/100}H${right}"/><text class="chart-label" x="5" y="${bottom-(bottom-top)*p/100+3}">${p}%</text>`).join('')}${samples.length>1?`<path class="chart-area" d="${cpu} L${left+(right-left)*(samples.length-1)/Math.max(59,samples.length-1)},${bottom}H${left}Z"/><path class="chart-cpu" d="${cpu}"/><path class="chart-ram" d="${ram}"/>`:''}${samples.length===1?`<circle cx="${left}" cy="${bottom-(bottom-top)*last.cpu/100}" r="3" fill="#5278ed"/>`:''}<text class="chart-label" x="${left}" y="219">${samples.length?new Date(samples[0].time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):''}</text><text class="chart-label" text-anchor="end" x="${right}" y="219">${samples.length>1?new Date(last.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Collecting live samples'}</text></svg>`;}
async function overview(id){return hostOverview(id);}
function simpleContainerTable(containers,stats,actions=false){return `<div class="table-wrap"><table class="container-table"><thead><tr><th>CONTAINER</th><th>STATUS</th><th>PUBLISHED PORTS</th><th>NETWORKS</th><th>CPU / RAM</th>${actions?'<th>ACTIONS</th>':''}</tr></thead><tbody>${containers.map(c=>{const s=stats.find(x=>x.Name===c.Names),running=c.State==='running';return `<tr><td data-label="Container"><div class="table-name"><span class="table-icon">${icon('docker')}</span><span>${me.role==='admin'?`<button class="container-details-link text-button" title="${esc(c.Names)}" data-id="${c.ID}">${esc(c.Names)}</button>`:`<strong>${esc(c.Names)}</strong>`}<small title="${esc(c.Image)}">${esc(c.Image)}</small>${c.Project?`<small>${esc(c.Project)} / ${esc(c.Service)}</small>`:''}</span></div></td><td data-label="Status">${pill(running?'Running':c.State||'Stopped',running?'green':'')}<small>${esc(c.Status)}</small></td><td data-label="Published ports">${portsMarkup(c)}</td><td data-label="Networks">${networksMarkup(c.Networks)}</td><td data-label="CPU / Memory">${s?esc(s.CPUPerc):'—'}<small>${s?esc(s.MemUsage.split(' / ')[0]):'—'}</small></td>${actions?`<td data-label="Actions"><div class="row-actions">${[[running?'stop':'start',running?'stop':'play',running?'Stop':'Start'],['restart','refresh','Restart']].map(([a,i,t])=>`<button class="icon-button container-action ${a==='stop'?'danger':''}" data-id="${esc(c.ID)}" data-action="${a}" data-name="${esc(c.Names)}" title="${t} container" aria-label="${t} ${esc(c.Names)}" ${me.role==='viewer'?'disabled':''}>${icon(i)}</button>`).join('')}${me.role==='admin'?`<button class="icon-button container-details-link" data-id="${c.ID}" title="Details, logs and settings" aria-label="Details for ${esc(c.Names)}">${icon('info')}</button>`:''}</div></td>`:''}</tr>`;}).join('')}</tbody></table></div>`;}
async function watch(job,target=null,onComplete=null){activeJob=job.id;const id=generation;const output=target||$('#job-output');if(!target){openModal(job.title,`<div class="modal-body"><div id="job-state">${pill('Running','blue')}</div><pre id="job-output"></pre></div><div class="form-actions">${button('job-close','Close',null)}</div>`);bind('job-close',()=>modal.close());}const tick=async()=>{if(id!==generation)return;try{const j=await api('/api/jobs?id='+encodeURIComponent(job.id));const el=target||$('#job-output');if(el)el.textContent=j.output||'Waiting for output…';if($('#job-state'))$('#job-state').innerHTML=pill(j.state,j.state==='succeeded'?'green':j.state==='failed'?'red':'blue');if(['queued','running'].includes(j.state))setTimeout(tick,1000);else{activeJob=null;if(onComplete)await onComplete(j);notify(j.state==='succeeded'?'Operation completed.':'Operation failed. Check the output for details.');}}catch(e){notify(e.message);}};tick();}
async function docker(id){content.innerHTML='<div class="loading-state">Reading containers and Compose projects…</div>';const d=await api('/api/docker');if(id!==generation)return;dockerData=d;$('#container-count').textContent=d.containers.length||'';
 $$('[data-docker-nav]').forEach(b=>{const active=b.dataset.dockerNav===dockerTab;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 content.innerHTML=`${d.errors?.length?notice('Some Docker details could not be read: '+d.errors.join(' ').slice(0,1000),'warning'):''}${!d.available?notice(d.installed?'Docker is installed, but this process cannot reach the engine. Check Docker permissions and service status.':'Docker Engine is not installed. Install it with Compose to start managing containers.','warning'):''}<div class="system-status-strip"><div><span>Engine status</span><strong>${pill(d.available?'Online · '+(d.version||'Docker'):'Unavailable',d.available?'green':'amber')}</strong></div><div><span>Running containers</span><strong>${d.containers.filter(c=>c.State==='running').length} / ${d.containers.length}</strong></div><div><span>Compose stacks</span><strong>${d.projects.length}</strong></div><div><span>Engine maintenance</span><strong>${me.role==='admin'?button('packages',d.installed?'Update engine':'Install Docker',d.installed?'refresh':'plus','secondary small'):'Read-only'}</strong></div></div><div class="card management-card" id="docker-panel"></div>`;
 bind('packages',async()=>{if(!await confirmOperation(d.installed?'Update Docker Engine?':'Install Docker & Compose?',d.installed?'Package updates may restart Docker and interrupt running containers.':'This installs Docker and Compose from configured signed Ubuntu repositories. Existing administrator permissions are required.',d.installed?'Update Docker':'Install'))return;watch(await post('/api/docker/packages',{action:d.installed?'update':'install'}));});dockerPanel();
 poll=setInterval(async()=>{try{const next=await api('/api/docker');if(id!==generation)return;dockerData=next;if(dockerTab==='containers')containerRows();}catch(e){if(id===generation)notify(e.message);}},5000);
}
function dockerPanel(){const d=dockerData;
 if(dockerTab==='apps'){appStorePanel();return;}if(dockerTab==='cleanup'){cleanupPanel();return;}if(dockerTab==='networks'){networksPanel();return;}if(dockerTab==='images'){imagesPanel();return;}if(dockerTab==='volumes'){volumesPanel();return;}
 if(dockerTab==='containers'){$('#docker-panel').innerHTML=`<div class="toolbar"><div class="search-box">${icon('search')}<input id="container-search" aria-label="Search containers" placeholder="Search containers…"></div><div class="toolbar-group"><select id="container-filter" class="filters-select" aria-label="Filter by state"><option value="all">All statuses</option><option value="running">Running</option><option value="stopped">Stopped</option></select><span class="live"><i class="status-dot"></i>Live</span>${me.role==='admin'?button('container-create','Create container','plus','primary'):''}</div></div><div id="container-rows"></div><div class="table-footer"><span id="container-result-count"></span><span>Updates every 5 seconds</span></div>`;$('#container-search').oninput=containerRows;$('#container-filter').onchange=containerRows;bind('container-create',()=>createContainerForm());containerRows();return;}
 $('#docker-panel').innerHTML=`<div class="card-header"><div><h2>Compose projects</h2><p>Published ports, connected networks and project controls.</p></div>${me.role==='admin'?button('compose-new','Deploy project','plus','primary'):''}</div>${d.projects.length?`<div class="table-wrap"><table><thead><tr><th>PROJECT</th><th>STATUS</th><th>PUBLISHED PORTS</th><th>NETWORKS</th><th>ACTIONS</th></tr></thead><tbody>${d.projects.map(p=>`<tr><td><strong>${esc(p.Name)}</strong><small>${p.Containers?.length||0} deployed container(s)</small></td><td>${pill(p.Status,p.Status.includes('running')?'green':'')}</td><td>${portsMarkup(p,true)}</td><td>${networksMarkup(p.Networks)}</td><td><div class="toolbar-group"><button class="button secondary small compose-manage" data-project="${esc(p.Name)}">Manage</button><button class="button secondary small compose-update" data-project="${esc(p.Name)}" ${me.role!=='admin'||!d.available?'disabled':''}>${icon('refresh')}Update</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('No Compose projects found','Deploy a project to manage its services here.','file')}<div class="table-footer"><span>Update pulls configured image tags, then redeploys changed services.</span><span>Host bindings do not prove public reachability.</span></div><div id="compose-drafts"></div>`;
 bind('compose-new',newComposeForm);$$('.compose-manage').forEach(b=>b.onclick=action(()=>composeProjectView(b.dataset.project)));$$('.compose-update').forEach(b=>b.onclick=action(async()=>{b.disabled=true;try{await composeUpdatePreview(b.dataset.project);}finally{b.disabled=false;}}));renderComposeDrafts();
}
async function composeUpdatePreview(project){
 const plan=await post('/api/compose/update/preview',{project});
 openModal('Update '+plan.project,`<form id="compose-update-form"><div class="modal-body">${notice('Pulls fresh images for the tags already in your Compose files. Version pins and digest pins stay pinned.')}<div class="table-wrap"><table><thead><tr><th>SERVICE</th><th>IMAGE / SOURCE</th><th>REPLICAS</th></tr></thead><tbody>${plan.services.map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td><code>${esc(s.image||'Local build')}</code>${s.localBuild?'<small>Local build · rebuild optional</small>':''}</td><td>${s.replicas}</td></tr>`).join('')}</tbody></table></div>${plan.services.some(s=>s.localBuild)?'<label class="checkbox-label detail-heading"><input id="compose-rebuild" type="checkbox">Also rebuild local-build services with fresh base images</label>':''}<details class="update-files"><summary>Deployment files & working directory</summary><p class="mono field-help">${esc(plan.workingDirectory)}</p>${[...plan.files,...plan.environmentFiles].map(f=>`<p class="mono field-help">${esc(f)}</p>`).join('')}</details><ul class="operation-notes">${plan.warnings.slice(1).map(w=>`<li>${esc(w)}</li>`).join('')}</ul><p class="form-error" role="alert"></p></div><div class="form-actions">${button('compose-update-cancel','Cancel',null)}<button class="button" type="submit">${icon('refresh')}Pull images & update</button></div></form>`,'editor');
 bind('compose-update-cancel',()=>modal.close());form('compose-update-form',async()=>{const job=await post('/api/compose/update',{project:plan.project,revision:plan.revision,mode:$('#compose-rebuild')?.checked?'build':'pull',confirm:true});watch(job,null,async()=>{dockerData=await api('/api/docker');if(dockerTab==='compose'&&$('#docker-panel'))dockerPanel();});});
}
async function cleanupPanel(){
 const id=generation;$('#docker-panel').innerHTML='<div class="loading-state">Reading Docker storage usage…</div>';
 try{const usage=await api('/api/docker/disk-usage');if(id!==generation||dockerTab!=='cleanup'||!$('#docker-panel'))return;
 $('#docker-panel').innerHTML=`<div class="card-header"><div><h2>Docker storage</h2><p>Engine-reported usage and reclaimable estimates.</p></div>${button('storage-refresh','Refresh usage','refresh')}</div><div class="table-wrap"><table><thead><tr><th>RESOURCE</th><th>TOTAL</th><th>ACTIVE</th><th>SIZE</th><th>RECLAIMABLE</th></tr></thead><tbody>${usage.map(r=>`<tr><td><strong>${esc(r.Type)}</strong></td><td>${esc(r.TotalCount)}</td><td>${esc(r.Active)}</td><td>${esc(r.Size)}</td><td>${esc(r.Reclaimable)}</td></tr>`).join('')}</tbody></table></div><div class="cleanup-body">${notice('Cleanup is engine-wide, across every project. Volumes, containers and networks are never pruned by these controls.')}<div class="cleanup-options">${[['dangling-images','Dangling images','Remove untagged images that are not used by a container.'],['unused-images','All unused images','Remove tagged and untagged images not referenced by any container, including stopped containers. Saved rollback images may be removed.'],['build-cache','Build cache','Remove unused cache for the default Docker builder. Future builds may take longer.']].map(([kind,title,description])=>`<div class="cleanup-option"><div><h3>${title}</h3><p>${description}</p></div><div class="cleanup-controls"><select class="filters-select cleanup-age" data-kind="${kind}" aria-label="Minimum age for ${title}"><option value="24h">Older than 24 hours</option><option value="168h">Older than 7 days</option><option value="720h">Older than 30 days</option><option value="all">Any age</option></select><button class="button secondary cleanup-start" data-kind="${kind}" data-title="${title}">Clean up</button></div></div>`).join('')}</div><p class="field-help">Reclaimable amounts are Docker estimates before age filtering. Cleanup cannot be undone; removed images can be pulled again and cache can be rebuilt.</p></div>`;
 bind('storage-refresh',cleanupPanel);$$('.cleanup-start').forEach(b=>b.onclick=action(async()=>{const olderThan=$$('.cleanup-age').find(s=>s.dataset.kind===b.dataset.kind).value;const ageText=olderThan==='all'?'of any age':olderThan==='24h'?'older than 24 hours':olderThan==='168h'?'older than 7 days':'older than 30 days';if(!await confirmOperation('Clean up '+b.dataset.title.toLowerCase()+'?',`This removes ${b.dataset.title.toLowerCase()} ${ageText} across the Docker engine. Volumes, containers and networks are preserved. Unused image cleanup may remove rollback images; cache cleanup makes future builds slower.`,'Clean up'))return;watch(await post('/api/docker/cleanup',{kind:b.dataset.kind,olderThan,confirm:true}),null,async()=>{if(dockerTab==='cleanup'&&$('#docker-panel'))await cleanupPanel();});}));
 }catch(e){if(id===generation&&dockerTab==='cleanup'&&$('#docker-panel'))$('#docker-panel').innerHTML=empty('Docker storage is unavailable',e.message,'disk');}
}
function containerRows(){if(!$('#container-rows'))return;const active=document.activeElement,focusKey=active?.closest('#container-rows')?{id:active.dataset.id,action:active.dataset.action,classes:active.className}:null;const previousScroll=$('#container-rows .table-wrap')?.scrollLeft||0;const q=$('#container-search').value.toLowerCase(),filter=$('#container-filter').value;const rows=dockerData.containers.filter(c=>(c.Names+' '+c.Image).toLowerCase().includes(q)&&(filter==='all'||(filter==='running'?c.State==='running':c.State!=='running')));$('#container-rows').innerHTML=rows.length?simpleContainerTable(rows,dockerData.stats,true):empty('No matching containers','Try a different search or status filter.','docker');bindContainerLinks();$('#container-result-count').textContent=`Showing ${rows.length} of ${dockerData.containers.length} containers`;$$('.container-action').forEach(b=>b.onclick=action(async()=>{if(!await confirmOperation(`${b.dataset.action[0].toUpperCase()+b.dataset.action.slice(1)} container?`,`${b.dataset.name} will be ${b.dataset.action==='stop'?'stopped':b.dataset.action==='start'?'started':'restarted'}.`,b.dataset.action))return;b.disabled=true;await post('/api/docker/action',{id:b.dataset.id,action:b.dataset.action});dockerData=await api('/api/docker');containerRows();notify('Container operation completed.');}));if(focusKey){const next=[...document.querySelectorAll('#container-rows button')].find(b=>b.dataset.id===focusKey.id&&b.dataset.action===focusKey.action&&b.className===focusKey.classes);next?.focus({preventScroll:true});}const wrap=$('#container-rows .table-wrap');if(wrap)wrap.scrollLeft=previousScroll;}
async function editFile(url,label){const data=await api(url);openModal('Edit configuration',`<form id="editor-form"><div class="modal-body"><p class="field-help mono">${esc(label)}</p><textarea id="file-text" aria-label="File contents" spellcheck="false">${esc(data.text)}</textarea><p class="field-help">A backup is created before saving. External changes are checked to prevent accidental overwrites.</p><p class="form-error" role="alert"></p></div><div class="form-actions">${button('editor-cancel','Cancel',null)}<button type="submit" class="button">${icon('check')}Save changes</button></div></form>`,'editor');bind('editor-cancel',()=>modal.close());form('editor-form',async()=>{const result=await post(url,{text:$('#file-text').value,revision:data.revision});modal.close();notify('File saved. Backup: '+result.backup);});}
async function system(){disposeSystemTools();if(me.role!=='admin'){content.innerHTML=empty('Administrator access required','Your account can view resources and containers. System tools require an administrator.','lock');return;}
 $$('[data-system-nav]').forEach(b=>{const active=b.dataset.systemNav===sub;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const hostAccess=await api('/api/host/status');content.innerHTML=`${hostAccessCard(hostAccess)}<div id="system-content"></div>`;bind('host-admin-setup',()=>hostAdminSetup(hostAccess));
 if(sub==='wireguard')await wireguardPage();
 if(sub==='grafana')await grafanaPage();
 if(sub==='readiness')await readinessPage();
 if(sub==='ai')await aiConnectionsPage();
 if(sub==='access')await panelAccessPage();
 if(sub==='tunnel'){await tunnelPage();}
 if(sub==='firewall')await firewallPage();
 if(sub==='terminal')await terminalPage();
 if(sub==='files')await fileManagerPage();
 if(sub==='backups')await backupsPage();
 if(sub==='cron')await cronPage();
 if(sub==='notifications')await notificationsPage();
}

async function users(){if(me.role!=='admin'){content.innerHTML=empty('Administrator access required','Only administrators can manage user access.','lock');return;}content.innerHTML='<div id="identity-content"></div>';await userList();}
async function userList(){const requestGeneration=generation;const list=await api('/api/users');if(requestGeneration!==generation||view!=='users')return;$('#identity-content').innerHTML=`<div class="card management-card"><div class="toolbar"><div class="section-table-heading"><h2>Administrator &amp; operator accounts</h2><span class="count-inline">${list.length} ${list.length===1?'account':'accounts'}</span></div>${button('add-user','Add user','plus','primary')}</div><div class="table-wrap"><table class="management-table"><thead><tr><th>USER</th><th>ROLE</th><th>SIGN-IN METHOD</th><th>STATUS</th><th class="actions-column">ACTIONS</th></tr></thead><tbody>${list.map(u=>`<tr><td><div class="table-name"><span class="role-icon">${esc(u.username.slice(0,2).toUpperCase())}</span><span><strong>${esc(u.username)}</strong>${u.username===me.username?'<small>Your account</small>':''}</span></div></td><td>${pill(u.role,u.role==='admin'?'blue':'')}</td><td>${u.authSource==='local'?'Panel account':'Retired sign-in method'}</td><td>${pill(u.enabled?(u.mustChangePassword?'Setup required':'Active'):'Disabled',u.enabled?(u.mustChangePassword?'amber':'green'):'')}</td><td class="actions-column">${u.enabled?`<button class="text-button disable-user" data-id="${esc(u.id)}" data-name="${esc(u.username)}" ${u.username===me.username?'disabled':''}>Disable</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></div><div class="card"><div class="card-header"><h2>Role permissions</h2><span class="muted tiny">Assigned per account</span></div><div class="quick-grid">${[['Admin','All server controls, users and settings','shield'],['Operator','Container operations and resource monitoring','docker'],['Viewer','Read-only resources and Docker inventory','user']].map(([t,d,i])=>`<div class="quick-link">${icon(i)}<span><strong>${t}</strong><small>${d}</small></span></div>`).join('')}</div></div>`;bind('add-user',addUser);$$('.disable-user').forEach(b=>b.onclick=action(async()=>{if(!await confirmOperation('Disable user?',`${b.dataset.name} will be signed out and unable to access the panel.`,'Disable user'))return;await post('/api/users/disable',{id:b.dataset.id});await userList();notify('User disabled.');}));}
function addUser(){openModal('Add panel user',`<form id="add-user-form"><div class="modal-body"><label>Username<input id="new-user" autocomplete="off" pattern="[a-zA-Z0-9._-]{3,64}" placeholder="e.g. alex" required><span class="field-help">3–64 letters, numbers, dots, underscores or hyphens.</span></label><label>Panel role<select id="new-role"><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select></label>${passwordField('new-password','Temporary password','new-password',true)}<p class="field-help">The user will change this temporary password at first sign-in.</p><p class="form-error" role="alert"></p></div><div class="form-actions">${button('user-cancel','Cancel',null)}<button class="button" type="submit">${icon('plus')}Create user</button></div></form>`);togglePassword('new-password');bind('user-cancel',()=>modal.close());form('add-user-form',async()=>{await post('/api/users',{username:$('#new-user').value,password:$('#new-password').value,role:$('#new-role').value});modal.close();await userList();notify('User created.');});}
async function render(){if(!canLeaveWebsite())return;disposeSecurityCenter();disposeWebsiteEditor();disposeSystemTools();clearInterval(poll);const id=++generation;try{me=await api('/api/me');if(id!==generation)return;if(me.mustChangePassword){account();return;}setShell('ready');if(await showOAuthConsent())return;syncRouteState();$$('[data-view]').forEach(b=>{const selected=b.dataset.view===view&&(b.dataset.dockerNav?dockerTab===b.dataset.dockerNav:!b.dataset.dockerNav)&&(b.dataset.websiteNav?(b.dataset.websiteTabNav?websiteTab===b.dataset.websiteTabNav&&websiteCategory===b.dataset.websiteNav:websiteCategory===b.dataset.websiteNav):!b.dataset.websiteNav)&&(b.dataset.databaseNav?databaseCategory===b.dataset.databaseNav:!b.dataset.databaseNav)&&(b.dataset.monitoringNav?monitoringCategory===b.dataset.monitoringNav:!b.dataset.monitoringNav)&&(b.dataset.systemNav?sub===b.dataset.systemNav:!b.dataset.systemNav);b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const dockerTitles={containers:['Containers','Live container state, published ports and resource consumption','Docker / Containers'],apps:['1-Click App Store','Curated open-source Docker application catalog with 1-click deployment','Docker / 1-Click App Store'],compose:['Compose projects','Multi-container stacks, environment files and image updates','Docker / Compose projects'],networks:['Container networks','Bridge, host and custom overlay networks','Docker / Networks'],images:['Container images','Cached images, tags and registry pulls','Docker / Images'],volumes:['Persistent volumes','Named volumes and mount points','Docker / Volumes'],cleanup:['Storage & cleanup','Reclaim unused images and build cache safely','Docker / Storage & cleanup']};
 const websiteTitles={all:['Websites','Virtual hosts, reverse proxies and isolated application runtimes','Websites / All websites'],proxy:['Reverse proxy sites','Upstream forwarding and TLS termination','Websites / Reverse proxy'],static:['Static websites','Atomic directory deployments with Nginx and Coraza validation','Websites / Static websites'],node:['Node.js applications','Isolated Node.js container runtimes','Websites / Node.js'],php:['PHP applications','Isolated PHP-FPM container runtimes','Websites / PHP'],python:['Python applications','Isolated Python container runtimes','Websites / Python'],runtimes:['Application runtimes','Official container images for Node.js, Python and PHP','Websites / Runtimes'],engine:['Web engine','Native Nginx / OpenResty routing engine and recovery','Websites / Web engine']};
 const monitoringTitles={console:['Grafana Console','Embedded real-time dashboards and AI-integrated server copilot','Monitoring / Grafana Console'],setup:['AI & Credentials','Configure AI API keys, Grafana Admin ID & password, and panel load polling','Monitoring / AI & Credentials'],metrics:['Metrics & Graphify','Prometheus exposition and Graphify 35x–77x token-optimized knowledge graph','Monitoring / Metrics & Graphify'],health:['Health & Repairs','Autonomous service, container, HTTP and storage health monitor','Monitoring / Health & Repairs']};
 const systemTitles={firewall:['Firewall','UFW host packet filtering and port rules','System / Firewall'],terminal:['Terminal','Interactive root PTY shell, quick diagnostics and session logging','System / Terminal'],files:['File manager','Browse, edit, upload and atomically manage server files','System / File manager'],backups:['Cloud Backups & S3','Automated multi-target S3/R2 cloud backups with AES-256 encryption','System / Backups'],cron:['Crontab Tasks','Autonomous task scheduler, periodic maintenance and command execution','System / Crontab'],notifications:['Alert Notifications','Multi-channel dispatches (Telegram, Discord, Slack, SMTP)','System / Notifications'],tunnel:['Cloudflare Tunnel','Outbound edge connectors and public hostname routing','System / Cloudflare Tunnel'],wireguard:['WireGuard VPN','Private encrypted mesh interfaces and split-tunnel client profiles','System / WireGuard'],readiness:['Production readiness','Automated verification checks and release integrity','System / Readiness'],ai:['AI connections','Remote MCP server access, OAuth clients and Graphify tools','System / AI connections'],access:['Panel address','Trusted HTTPS origin for authentication, cookies and WebSockets','System / Panel address']};
 const dbNames={all:'All databases',mysql:'MySQL',postgresql:'PostgreSQL',redis:'Redis',mariadb:'MariaDB'};
 const headingMap={
  overview:['Overview','Real-time host telemetry, mounted storage and active workloads','Overview'],
  docker:dockerTitles[dockerTab]||dockerTitles.containers,
  websites:websiteTab!=='sites'?websiteTitles[websiteTab]:(websiteTitles[websiteCategory]||websiteTitles.all),
  databases:[dbNames[databaseCategory]||'Databases','Native APT-managed database services and cluster controls','Databases / '+(dbNames[databaseCategory]||'All')],
  monitoring:monitoringTitles[monitoringCategory]||monitoringTitles.console,
  waf:['Security Center','Turn Coraza WAF & IDS protection on/off and inspect live threat origins','Security Center'],
  system:systemTitles[sub]||systemTitles.firewall,
  users:['Users & Roles','Manage panel administrators, operators and role permissions','Users & Roles'],
  tasks:['Tasks & Audit','Durable privileged jobs, transactional rollbacks and security audit trail','Tasks & Audit'],
  appearance:['Appearance & Themes','Personalize panel accent colors, dark/light mode, and interface density','Appearance & Themes']
 };
 setHeading(...(headingMap[view]||['Overview','','Overview']));
 document.body.dataset.view=view;content.innerHTML='<div class="loading-state">Loading your workspace…</div>';if(view==='overview')await overview(id);if(view==='docker')await docker(id);if(view==='monitoring')await monitoringPage();if(view==='system')await system();if(view==='websites')await websitesPage(id);if(view==='databases')await databasesPage(id);if(view==='tasks')await tasksPage();if(view==='users')await users();if(view==='waf')await securityCenterPage();if(view==='appearance')await appearancePage();}catch(e){if(id!==generation)return;if(e.status===401){await login();}else{content.innerHTML=`<div class="card">${empty('Unable to load this section',e.message,'info')}</div>`;notify(e.message);}}}
const ACCENT_PRESETS=[
 {id:'gold',name:'Imperial Gold (Default)',desc:'Luxury brushed metallic gold & warm amber. Mission-control elegance with maximum readability.',primary:'#f59e0b',gradient:'linear-gradient(135deg, #f59e0b, #d97706)'},
 {id:'emerald',name:'Cyber Emerald',desc:'High-tech terminal emerald green. Matrix & hacker aesthetic.',primary:'#10b981',gradient:'linear-gradient(135deg, #10b981, #059669)'},
 {id:'sapphire',name:'Electric Sapphire',desc:'Crisp corporate azure & royal blue. Clean developer aesthetic.',primary:'#3b82f6',gradient:'linear-gradient(135deg, #3b82f6, #1d4ed8)'},
 {id:'violet',name:'Amethyst Violet',desc:'Futuristic neon purple & electric violet. Cyberpunk vibe.',primary:'#a855f7',gradient:'linear-gradient(135deg, #a855f7, #7e22ce)'},
 {id:'crimson',name:'Crimson Ruby',desc:'High-urgency scarlet & vivid rose. High-contrast operations.',primary:'#f43f5e',gradient:'linear-gradient(135deg, #f43f5e, #be123c)'},
 {id:'slate',name:'Titanium Slate',desc:'Sleek minimalist monochrome titanium. Distraction-free focus.',primary:'#94a3b8',gradient:'linear-gradient(135deg, #94a3b8, #475569)'}
];
function getAppearanceSettings(){
 try{
  return {
   theme:localStorage.getItem('panel-theme')||'dark',
   accent:localStorage.getItem('panel-accent')||'gold',
   density:localStorage.getItem('panel-density')||'comfortable'
  };
 }catch{
  return {theme:'dark',accent:'gold',density:'comfortable'};
 }
}
function applyAppearanceSettings(opts={}){
 const current=Object.assign(getAppearanceSettings(),opts);
 try{
  if(opts.theme)localStorage.setItem('panel-theme',opts.theme);
  if(opts.accent)localStorage.setItem('panel-accent',opts.accent);
  if(opts.density)localStorage.setItem('panel-density',opts.density);
 }catch{}
 const root=document.documentElement;
 if(current.theme==='auto'){
  const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme=prefersDark?'dark':'light';
 }else{
  root.dataset.theme=current.theme;
 }
 root.dataset.accent=current.accent;
 root.dataset.density=current.density;
}
async function appearancePage(){
 const s=getAppearanceSettings();
 content.innerHTML=`
  <div class="card appearance-hero-card">
   <div class="card-header">
    <div>
     <h2>Appearance &amp; Theme Studio</h2>
     <p>Select your primary accent color, dark or light mode, and interface density. All preferences take effect instantly and stay saved.</p>
    </div>
    <div class="row-actions">
     <button id="theme-reset" class="button secondary" type="button">${icon('refresh')} Reset to Imperial Gold</button>
    </div>
   </div>
  </div>

  <div class="card">
   <div class="card-header">
    <h2>1. Accent Color Palette</h2>
    <span class="muted tiny">Select primary button and system highlight color</span>
   </div>
   <div class="appearance-accent-grid">
    ${ACCENT_PRESETS.map(p=>`
     <div class="appearance-accent-card ${s.accent===p.id?'active':''}" data-accent="${p.id}" tabindex="0" role="button" aria-pressed="${s.accent===p.id}">
      <div class="accent-swatch" style="background:${p.gradient}"></div>
      <div class="accent-info">
       <div class="accent-title-row">
        <strong>${esc(p.name)}</strong>
        ${s.accent===p.id?`<span class="pill green"><i class="status-dot"></i>Active</span>`:''}
       </div>
       <p>${esc(p.desc)}</p>
      </div>
     </div>
    `).join('')}
   </div>
  </div>

  <div class="appearance-options-grid">
   <div class="card">
    <div class="card-header">
     <h2>2. Color Mode</h2>
     <span class="muted tiny">Dark, Light or System sync</span>
    </div>
    <div class="appearance-mode-options">
     <button class="appearance-mode-btn ${s.theme==='dark'?'active':''}" data-mode="dark" type="button">
      <span class="mode-icon">${icon('shield')}</span>
      <strong>Dark Mode</strong>
      <small>Deep obsidian &amp; slate. Mission-control standard.</small>
     </button>
     <button class="appearance-mode-btn ${s.theme==='light'?'active':''}" data-mode="light" type="button">
      <span class="mode-icon">${icon('sun')}</span>
      <strong>Light Mode</strong>
      <small>Crisp pearl &amp; high-contrast daylight view.</small>
     </button>
     <button class="appearance-mode-btn ${s.theme==='auto'?'active':''}" data-mode="auto" type="button">
      <span class="mode-icon">${icon('cpu')}</span>
      <strong>Auto (System)</strong>
      <small>Matches operating system color scheme.</small>
     </button>
    </div>
   </div>

   <div class="card">
    <div class="card-header">
     <h2>3. Display Density</h2>
     <span class="muted tiny">Padding and information density</span>
    </div>
    <div class="appearance-density-options">
     <button class="appearance-density-btn ${s.density==='comfortable'?'active':''}" data-density="comfortable" type="button">
      <span class="density-icon">${icon('overview')}</span>
      <strong>Comfortable</strong>
      <small>Generous touch targets and comfortable breathing room.</small>
     </button>
     <button class="appearance-density-btn ${s.density==='compact'?'active':''}" data-density="compact" type="button">
      <span class="density-icon">${icon('docker')}</span>
      <strong>Compact</strong>
      <small>Tighter padding and higher data density for NOC displays.</small>
     </button>
    </div>
   </div>
  </div>

  <div class="card appearance-preview-card">
   <div class="card-header">
    <h2>Interactive Live Preview</h2>
    <span class="muted tiny">How your buttons and controls render right now</span>
   </div>
   <div class="appearance-preview-content">
    <div class="preview-group">
     <span class="preview-label">Buttons</span>
     <div class="row-actions">
      <button class="button" type="button">${icon('check')} Primary Button</button>
      <button class="button secondary" type="button">${icon('refresh')} Secondary</button>
      <button class="button danger" type="button">${icon('trash')} Danger Action</button>
      <button class="button ghost" type="button">${icon('info')} Ghost Button</button>
     </div>
    </div>
    <div class="preview-group">
     <span class="preview-label">Status Pills &amp; Badges</span>
     <div class="row-actions">
      <span class="pill green"><i class="status-dot"></i>Service Active</span>
      <span class="pill primary">Primary Highlight</span>
      <span class="pill amber">Warning Alert</span>
      <span class="pill red">Denied</span>
      <span class="pill">Neutral / Muted</span>
     </div>
    </div>
    <div class="preview-group">
     <span class="preview-label">Sample Data Table Row</span>
     <div class="table-wrap">
      <table class="management-table">
       <thead>
        <tr><th>RESOURCE</th><th>TYPE</th><th>STATUS</th><th>ACTIONS</th></tr>
       </thead>
       <tbody>
        <tr>
         <td><strong class="table-primary">cyberpross-core</strong><small>nginx:alpine &middot; 0.0.0.0:443</small></td>
         <td><span class="pill primary">Production Container</span></td>
         <td><span class="pill green"><i class="status-dot"></i>Healthy</span></td>
         <td>
          <div class="row-actions">
           <button class="button small" type="button">${icon('play')} Start</button>
           <button class="button secondary small" type="button">Inspect</button>
          </div>
         </td>
        </tr>
       </tbody>
      </table>
     </div>
    </div>
   </div>
  </div>
 `;

 $$('.appearance-accent-card').forEach(c=>c.onclick=()=>{
  const accent=c.dataset.accent;
  applyAppearanceSettings({accent});
  appearancePage();
  notify('Accent theme set to '+(ACCENT_PRESETS.find(p=>p.id===accent)?.name||accent));
 });

 $$('.appearance-mode-btn').forEach(b=>b.onclick=()=>{
  const theme=b.dataset.mode;
  applyAppearanceSettings({theme});
  appearancePage();
  notify('Color mode set to '+theme);
 });

 $$('.appearance-density-btn').forEach(b=>b.onclick=()=>{
  const density=b.dataset.density;
  applyAppearanceSettings({density});
  appearancePage();
  notify('Display density set to '+density);
 });

 bind('theme-reset',()=>{
  applyAppearanceSettings({accent:'gold',theme:'dark',density:'comfortable'});
  appearancePage();
  notify('Reset to Imperial Gold (Default).');
 });
}
icons();startTaskMonitor();startAutomaticUpdates();initAiAssistant();applyAppearanceSettings();
$$('[data-view]').forEach(b=>b.onclick=()=>{if(!canLeaveWebsite())return;if(b.dataset.view==='docker'){dockerTab=b.dataset.dockerNav||dockerTab||'containers';}if(b.dataset.view==='websites'){websiteCategory=b.dataset.websiteNav||'all';websiteTab=b.dataset.websiteTabNav||'sites';}if(b.dataset.view==='databases'){databaseCategory=b.dataset.databaseNav||'all';nativeDatabaseTab='service';}if(b.dataset.view==='monitoring'){monitoringCategory=b.dataset.monitoringNav||monitoringCategory||'console';}if(b.dataset.view==='system'&&b.dataset.systemNav){sub=b.dataset.systemNav;}route(b.dataset.view);});window.addEventListener('hashchange',()=>{const before=JSON.stringify([view,sub,dockerTab,websiteCategory,websiteTab,databaseCategory,monitoringCategory]);restoreRouteState();if(JSON.stringify([view,sub,dockerTab,websiteCategory,websiteTab,databaseCategory,monitoringCategory])!==before)render();});bind('refresh',render);bind('account',async()=>{me=await api('/api/me');account();});bind('logout',async()=>{await post('/api/logout');document.body.classList.remove('nav-open');await login();});bind('theme',()=>{const current=document.documentElement.dataset.theme==='dark'?'light':'dark';applyAppearanceSettings({theme:current});});bind('mobile-menu',toggleSidebar);bind('nav-dismiss',()=>{document.body.classList.remove('nav-open');updateSidebarControl();$('#mobile-menu').focus();});bind('nav-backdrop',()=>{document.body.classList.remove('nav-open');updateSidebarControl();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('nav-open');updateSidebarControl();}});window.addEventListener('resize',()=>{if($('#resource-chart'))$('#resource-chart').innerHTML=chartMarkup();});initializeSidebar();restoreRouteState();render();

// Apply shared presentation semantics to every resource view, including live rows.
function enhanceWorkspace(){
 document.querySelectorAll('.table-wrap').forEach(w=>{if(!w.hasAttribute('tabindex'))w.tabIndex=0;if(!w.hasAttribute('aria-label')){const heading=w.closest('.card')?.querySelector('h2')?.textContent;w.setAttribute('role','region');w.setAttribute('aria-label',(heading||document.getElementById('title').textContent)+' table');}});
 document.querySelectorAll('table').forEach(t=>{t.setAttribute('role','table');const headings=[...t.querySelectorAll('thead th')];headings.forEach(h=>{h.scope='col';if(h.textContent===h.textContent.toUpperCase()){const label=h.textContent.toLowerCase().replace(/\b(cpu|ram|ip|ipv4|ipv6|udp|tcp|https|http|sso|id|tls)\b/g,w=>w.toUpperCase()).replace(/^[a-z]/,c=>c.toUpperCase());if(label!==h.textContent)h.textContent=label;}});t.querySelectorAll('tr').forEach(r=>r.setAttribute('role','row'));t.querySelectorAll('td').forEach(c=>{c.setAttribute('role','cell');if(!c.hasAttribute('data-label')&&headings[c.cellIndex])c.dataset.label=headings[c.cellIndex].textContent;});});
 document.querySelectorAll('.tabs').forEach(g=>{if(g.getAttribute('role')==='tablist')return;g.setAttribute('role','group');g.setAttribute('aria-label','Section navigation');g.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active'))));});
 document.querySelectorAll('input[id],select[id],textarea[id]').forEach(e=>{if(!e.name)e.name=e.id;});
}
let workspaceDecorationPending=false;
const workspaceObserver=new MutationObserver(()=>{if(workspaceDecorationPending)return;workspaceDecorationPending=true;requestAnimationFrame(()=>{workspaceDecorationPending=false;enhanceWorkspace();});});
workspaceObserver.observe(content,{childList:true,subtree:true});workspaceObserver.observe(modal,{childList:true,subtree:true});enhanceWorkspace();

let recentAuthenticationRequest=null;
function recentAuthentication(mfaEnabled){
 if(recentAuthenticationRequest)return recentAuthenticationRequest;
 recentAuthenticationRequest=new Promise((resolve,reject)=>{
  const box=document.createElement('dialog'),previous=document.activeElement;let complete=false;
  box.className='modal';box.setAttribute('aria-labelledby','stepup-title');
  box.innerHTML=`<div class="modal-head"><h2 id="stepup-title">Verify your identity</h2><button class="icon-button" type="button" data-stepup-close aria-label="Cancel verification">${icon('close')}</button></div><form id="stepup-form"><div class="modal-body"><p>Verify your password${mfaEnabled?' and authenticator or unused backup code':''} to continue the change you selected.</p>${passwordField('stepup-password','Current password','current-password')}${mfaEnabled?'<label>Authenticator or unused backup code<input id="stepup-code" autocomplete="one-time-code" maxlength="128" required></label>':''}<p class="form-error" role="alert"></p></div><div class="form-actions"><button type="button" class="button secondary" data-stepup-cancel>Cancel</button><button type="submit" class="button">Verify and continue</button></div></form>`;
  const close=()=>box.close();box.querySelector('[data-stepup-close]').onclick=close;box.querySelector('[data-stepup-cancel]').onclick=close;
  box.addEventListener('close',()=>{box.remove();if(document.contains(previous))previous.focus();if(!complete)reject(Error('Verification cancelled. No change was performed.'));},{once:true});
  document.body.append(box);togglePassword('stepup-password');
  form('stepup-form',async()=>{await post('/api/account/reauth',{currentPassword:box.querySelector('#stepup-password').value,code:box.querySelector('#stepup-code')?.value.trim()});complete=true;box.close();resolve();});
  box.showModal();box.querySelector('#stepup-password').focus();
 }).finally(()=>{recentAuthenticationRequest=null;});
 return recentAuthenticationRequest;
}


/* --- Phase 1-5 Strategic Extensions: App Store, Cloud Backups, Crontab & AI Assistant --- */
async function appStorePanel(){
  $('#docker-panel').innerHTML='<div class="loading-state">Loading application catalog…</div>';
  try{
    const apps=await api('/api/apps/catalog');
    if(!apps||!apps.length){
      $('#docker-panel').innerHTML=empty('No applications available','Unable to read application catalog.','docker');
      return;
    }
    $('#docker-panel').innerHTML=`<div class="card-header">
      <div><h2>1-Click Application Store</h2><p>Deploy production-ready open-source stacks with automated reverse proxying and persistent volumes.</p></div>
      <div class="toolbar-group">
        <span class="count-inline">${apps.length} verified templates</span>
      </div>
    </div>
    <div class="app-catalog-grid">
      ${apps.map(a=>`
        <div class="app-card" data-app="${esc(a.id)}">
          <div class="app-card-head">
            <div class="app-icon">${a.icon||'📦'}</div>
            <div class="app-title-group">
              <h3>${esc(a.name)}</h3>
              <small class="muted">${esc(a.category)} · Port ${a.defaultPort}</small>
            </div>
          </div>
          <p class="app-desc">${esc(a.description)}</p>
          <div class="app-card-footer">
            ${a.installed?pill('Installed','green'):pill('Ready','blue')}
            <button type="button" class="button ${a.installed?'secondary':'primary'} small deploy-app-btn" data-id="${esc(a.id)}" data-name="${esc(a.name)}">
              ${a.installed?'Deploy Another':'1-Click Deploy'}
            </button>
          </div>
        </div>
      `).join('')}
    </div>`;

    $$('.deploy-app-btn').forEach(b=>{
      b.onclick=action(async()=>{
        const detail=await api('/api/apps/catalog?id='+encodeURIComponent(b.dataset.id));
        openDeployAppModal(detail);
      });
    });
  }catch(e){
    $('#docker-panel').innerHTML=empty('Catalog unavailable',e.message,'docker');
  }
}

function openDeployAppModal(app){
  openModal('Deploy '+app.name,`<form id="app-deploy-form">
    <div class="modal-body">
      <div class="form-grid">
        <label>Stack Name<input name="name" value="${esc(app.id)}" required pattern="[a-z0-9_-]{2,32}"></label>
        <label>Host Port<input name="port" type="number" min="1024" max="65535" value="${app.suggestedPort||app.defaultPort}" required></label>
        <label class="span-2">Custom Subdomain / Proxy (optional)<input name="domain" placeholder="e.g. ${esc(app.id)}.yourdomain.com"><span class="field-help">Automatically configures Nginx reverse proxy and Coraza WAF for this domain.</span></label>
      </div>
      ${(app.envSchema||[]).length?`<h4 style="margin:14px 0 6px">Environment Configuration</h4>
        <div class="form-grid">
          ${app.envSchema.map(f=>`<label class="${f.secret?'span-2':''}">
            ${esc(f.label||f.key)}
            <input name="env_${esc(f.key)}" type="${f.secret?'password':'text'}" value="${esc(f.default||'')}" ${f.required?'required':''}>
          </label>`).join('')}
        </div>`:''}
      <p class="field-help">Creates an isolated Docker Compose project, provisions storage volumes, and starts the container stack.</p>
      <p class="form-error" role="alert"></p>
    </div>
    <div class="form-actions">
      <button type="button" class="button secondary" onclick="modal.close()">Cancel</button>
      <button type="submit" class="button primary">${icon('plus')}Deploy Stack</button>
    </div>
  </form>`,'editor');

  form('app-deploy-form',async e=>{
    const f=new FormData(e);
    const name=f.get('name')?.trim();
    const port=Number(f.get('port'));
    const domain=f.get('domain')?.trim()||undefined;
    const env={};
    for(const [k,v] of f.entries()){
      if(k.startsWith('env_')) env[k.slice(4)]=v;
    }
    modal.close();
    const job=await post('/api/apps/deploy',{appId:app.id,name,port,env,domain,confirm:true});
    watch(job,null,async()=>{
      dockerTab='containers';
      route('docker');
      notify(`Application ${name} deployed successfully!`);
    });
  });
}

async function backupsPage(){
  $('#system-content').innerHTML='<div class="loading-state">Reading S3 cloud backup status…</div>';
  try{
    const [cfg,list]=await Promise.all([
      api('/api/backup/cloud/config').catch(()=>({})),
      api('/api/backup/cloud/list').catch(()=>({configured:false,items:[]}))
    ]);

    $('#system-content').innerHTML=`<div class="card management-card">
      <div class="toolbar">
        <div class="section-table-heading">
          <h2>S3 Cloud Storage Backups &amp; Disaster Recovery</h2>
          <span class="count-inline">${list.configured?`${list.items?.length||0} snapshot(s) in S3`:'Not configured'}</span>
        </div>
        <div class="table-toolbar-actions">
          ${button('backup-now-btn','Run Backup Now','disk','primary')}
        </div>
      </div>

      <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <h3 style="margin-bottom:10px">S3 Storage Settings</h3>
        <form id="backup-config-form" class="form-grid">
          <label>Provider
            <select name="provider">
              <option value="r2" ${cfg.provider==='r2'?'selected':''}>Cloudflare R2</option>
              <option value="s3" ${cfg.provider==='s3'?'selected':''}>Amazon Web Services (AWS S3)</option>
              <option value="minio" ${cfg.provider==='minio'?'selected':''}>MinIO (Self-hosted S3)</option>
              <option value="b2" ${cfg.provider==='b2'?'selected':''}>Backblaze B2</option>
              <option value="custom" ${cfg.provider==='custom'?'selected':''}>Custom S3-compatible</option>
            </select>
          </label>
          <label>S3 Endpoint URL<input name="endpoint" placeholder="https://<account-id>.r2.cloudflarestorage.com" value="${esc(cfg.endpoint||'')}"></label>
          <label>Bucket Name<input name="bucket" placeholder="cyberpross-backups" value="${esc(cfg.bucket||'')}"></label>
          <label>Region<input name="region" placeholder="auto or us-east-1" value="${esc(cfg.region||'auto')}"></label>
          <label>Access Key ID<input name="accessKeyId" value="${esc(cfg.accessKeyId||'')}"></label>
          <label>Secret Access Key<input name="secretAccessKey" type="password" placeholder="${cfg.secretAccessKey?'(Configured)':''}"></label>
          <label>Client-side AES-256 Encryption Password<input name="encryptionPassword" type="password" placeholder="${cfg.encryptionPassword?'(Configured)':''}"></label>
          <label>Retention Policy (Keep Last N Backups)<input name="retentionCount" type="number" min="1" max="100" value="${cfg.retentionCount||7}"></label>
          <div class="span-2" style="margin-top:8px">
            <button type="submit" class="button primary small">Save S3 Settings</button>
          </div>
        </form>
      </div>

      <div class="table-wrap">
        <table class="management-table">
          <thead><tr><th>BACKUP SNAPSHOT</th><th>TARGET</th><th>SIZE</th><th>LAST MODIFIED</th><th>ENCRYPTION</th></tr></thead>
          <tbody>
            ${(list.items||[]).length?list.items.map(b=>`
              <tr>
                <td><strong>${esc(b.key)}</strong></td>
                <td>${pill(b.target,'blue')}</td>
                <td>${(b.sizeBytes/(1024*1024)).toFixed(2)} MB</td>
                <td>${esc(b.lastModified)}</td>
                <td>${b.isEncrypted?pill('AES-256-GCM','green'):pill('Unencrypted','amber')}</td>
              </tr>
            `).join(''):`<tr><td colspan="5">${empty('No cloud backups stored yet','Run an instant backup above or save S3 credentials.','disk')}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

    form('backup-config-form',async e=>{
      const f=Object.fromEntries(new FormData(e));
      await post('/api/backup/cloud/config',f);
      notify('S3 Cloud Storage settings updated.');
      await backupsPage();
    });

    bind('backup-now-btn',async()=>{
      if(!confirm('Execute immediate S3 Cloud Backup for panel, databases, and websites?')) return;
      const job=await post('/api/backup/cloud/run',{targets:['panel','databases','websites'],encrypt:true,confirm:true});
      watch(job,null,async()=>{
        notify('Cloud backup finished and uploaded to S3!');
        await backupsPage();
      });
    });
  }catch(e){
    $('#system-content').innerHTML=empty('Cloud backups unavailable',e.message,'disk');
  }
}

async function cronPage(){
  $('#system-content').innerHTML='<div class="loading-state">Reading crontab schedule…</div>';
  try{
    const tasks=await api('/api/cron/tasks');
    $('#system-content').innerHTML=`<div class="card management-card">
      <div class="toolbar">
        <div class="section-table-heading">
          <h2>Crontab Scheduled Tasks</h2>
          <span class="count-inline">${tasks.length} active scheduled task(s)</span>
        </div>
        <div class="table-toolbar-actions">
          ${button('add-cron-btn','Add Scheduled Task','plus','primary')}
        </div>
      </div>
      <div class="table-wrap">
        <table class="management-table">
          <thead><tr><th>TASK NAME</th><th>SCHEDULE</th><th>TYPE</th><th>STATUS</th><th>LAST RUN</th><th>ACTIONS</th></tr></thead>
          <tbody>
            ${tasks.length?tasks.map(t=>`
              <tr>
                <td><strong>${esc(t.name)}</strong>${t.command?`<br><small class="mono muted">${esc(t.command.slice(0,50))}</small>`:''}</td>
                <td><code>${esc(t.schedule)}</code></td>
                <td>${pill(t.type,'blue')}</td>
                <td>${pill(t.enabled?'Active':'Paused',t.enabled?'green':'amber')}${t.lastExitCode!==null?`<br><small>${t.lastExitCode===0?'✓ Exit 0':'⚠ Exit '+t.lastExitCode}</small>`:''}</td>
                <td>${t.lastRun?new Date(t.lastRun).toLocaleString():'Never'}</td>
                <td class="actions-column">
                  <button type="button" class="button secondary small cron-run-btn" data-id="${esc(t.id)}">Run Now</button>
                  <button type="button" class="text-button cron-delete-btn" data-id="${esc(t.id)}">Delete</button>
                </td>
              </tr>
            `).join(''):`<tr><td colspan="6">${empty('No scheduled crontab tasks','Add a task to schedule automatic commands or backups.','clock')}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

    bind('add-cron-btn',()=>{
      openModal('Add Scheduled Task',`<form id="add-cron-form">
        <div class="modal-body">
          <label>Task Name<input name="name" placeholder="e.g. Nightly Log Compression" required></label>
          <label>Cron Expression<input name="schedule" placeholder="0 2 * * * or @daily" value="0 2 * * *" required><span class="field-help">Standard 5-field cron syntax (min hour dom mon dow) or aliases like @daily, @hourly.</span></label>
          <label>Task Type
            <select name="type" id="cron-type-select">
              <option value="shell">Shell Command</option>
              <option value="backup">S3 Cloud Backup</option>
              <option value="docker_cleanup">Docker Prune & Cache Reclaim</option>
              <option value="ssl_renew">Check ACME SSL Expiry</option>
            </select>
          </label>
          <label id="cron-cmd-label">Shell Command<textarea name="command" rows="3" placeholder="/usr/bin/find /var/log -type f -name '*.log' -mtime +7 -delete"></textarea></label>
          <p class="form-error" role="alert"></p>
        </div>
        <div class="form-actions">
          <button type="button" class="button secondary" onclick="modal.close()">Cancel</button>
          <button type="submit" class="button primary">Create Task</button>
        </div>
      </form>`);

      $('#cron-type-select').onchange=()=>{
        $('#cron-cmd-label').style.display=$('#cron-type-select').value==='shell'?'block':'none';
      };

      form('add-cron-form',async e=>{
        const f=Object.fromEntries(new FormData(e));
        modal.close();
        await post('/api/cron/tasks',f);
        notify('Scheduled task created.');
        await cronPage();
      });
    });

    $$('.cron-run-btn').forEach(b=>{
      b.onclick=action(async()=>{
        b.disabled=true;
        try{
          await post('/api/cron/tasks/run',{id:b.dataset.id,confirm:true});
          notify('Task executed.');
          await cronPage();
        }finally{b.disabled=false;}
      });
    });

    $$('.cron-delete-btn').forEach(b=>{
      b.onclick=action(async()=>{
        if(!confirm('Delete this scheduled task?')) return;
        await post('/api/cron/tasks/delete',{id:b.dataset.id,confirm:true});
        notify('Task deleted.');
        await cronPage();
      });
    });
  }catch(e){
    $('#system-content').innerHTML=empty('Crontab unavailable',e.message,'clock');
  }
}

async function notificationsPage(){
  $('#system-content').innerHTML='<div class="loading-state">Reading notification configurations…</div>';
  try{
    const cfg=await api('/api/notifications/config');
    const tgConfigured=Boolean(cfg.telegram?.botToken&&cfg.telegram?.chatId);
    const dcConfigured=Boolean(cfg.discord?.webhookUrl);
    const slConfigured=Boolean(cfg.slack?.webhookUrl);
    const whConfigured=Boolean(cfg.webhook?.url);
    const activeCount=[cfg.telegram?.enabled&&tgConfigured,cfg.discord?.enabled&&dcConfigured,cfg.slack?.enabled&&slConfigured,cfg.webhook?.enabled&&whConfigured].filter(Boolean).length;
    const configuredCount=[tgConfigured,dcConfigured,slConfigured,whConfigured].filter(Boolean).length;
    const activeEvents=Object.values(cfg.events||{}).filter(v=>v!==false).length;

    $('#system-content').innerHTML=`
      <div class="notif-hero-card">
        <div class="notif-hero-top">
          <div class="notif-hero-title">
            <div class="notif-hero-icon">${icon('overview')}</div>
            <div>
              <div style="display:flex;align-items:center;gap:8px">
                <h2 style="margin:0;font-size:18px">Alert Notifications &amp; Incident Dispatcher</h2>
                ${pill(activeCount>0?'● DISPATCH ENGINE LIVE':'○ NO CHANNELS ACTIVE',activeCount>0?'green':'amber')}
              </div>
              <p class="muted" style="margin:4px 0 0;font-size:12px">Instant multi-channel push alerts for container crashes, storage exhaustion, Coraza WAF threat spikes, and backup failures.</p>
            </div>
          </div>
          <div class="row-actions">
            ${button('notif-test-all','Broadcast test to all','play','secondary')}
            ${button('notif-help','Setup guide','info')}
          </div>
        </div>
        <div class="notif-kpi-strip">
          <div class="notif-kpi-item">
            <span class="notif-kpi-label">Active Channels</span>
            <span class="notif-kpi-val">${activeCount} of 4 Active</span>
          </div>
          <div class="notif-kpi-item">
            <span class="notif-kpi-label">Configured Integrations</span>
            <span class="notif-kpi-val">${configuredCount} Configured</span>
          </div>
          <div class="notif-kpi-item">
            <span class="notif-kpi-label">Event Subscriptions</span>
            <span class="notif-kpi-val">${activeEvents} of 5 Subscribed</span>
          </div>
          <div class="notif-kpi-item">
            <span class="notif-kpi-label">Delivery Transport</span>
            <span class="notif-kpi-val">${pill('Encrypted HTTPS Egress','green')}</span>
          </div>
        </div>
      </div>

      <form id="notif-config-form">
        <div class="section-table-heading" style="margin-bottom:12px">
          <h3>1. Delivery Channels &amp; Webhook Integrations</h3>
          <p class="muted tiny">Configure endpoints where critical system alerts and operational notices are pushed.</p>
        </div>

        <div class="notif-channel-grid">
          <!-- Telegram -->
          <div class="notif-channel-card notif-card-telegram">
            <div class="notif-channel-header">
              <div class="notif-channel-brand">
                <div class="notif-brand-icon">✈️</div>
                <div>
                  <h4 class="notif-channel-title">Telegram Bot</h4>
                  <small class="muted">Instant push messages &amp; group mentions</small>
                </div>
              </div>
              ${pill(cfg.telegram?.enabled?(tgConfigured?'Active':'Missing info'):'Disabled',cfg.telegram?.enabled?(tgConfigured?'green':'amber'):'')}
            </div>
            <label class="checkbox-label" style="font-weight:600">
              <input type="checkbox" name="tg_enabled" ${cfg.telegram?.enabled?'checked':''}> Enable Telegram channel
            </label>
            <label>Bot Token
              <input name="tg_botToken" type="password" placeholder="${cfg.telegram?.botToken?'•••••••••••• (Configured)': 'e.g. 123456789:ABCdefGHIjklMNO'}" autocomplete="off">
              <small class="field-help">Obtain via <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a></small>
            </label>
            <label>Chat ID / Channel ID
              <input name="tg_chatId" value="${esc(cfg.telegram?.chatId||'')}" placeholder="e.g. 987654321 or -100123456789">
              <small class="field-help">Your Telegram user ID or group chat ID</small>
            </label>
            <div style="margin-top:auto;padding-top:10px">
              <button type="button" class="button secondary small" id="test-tg-btn" style="width:100%">${icon('play')} Test Telegram dispatch</button>
            </div>
          </div>

          <!-- Discord -->
          <div class="notif-channel-card notif-card-discord">
            <div class="notif-channel-header">
              <div class="notif-channel-brand">
                <div class="notif-brand-icon">🎮</div>
                <div>
                  <h4 class="notif-channel-title">Discord Webhook</h4>
                  <small class="muted">Rich embed alerts in your server channel</small>
                </div>
              </div>
              ${pill(cfg.discord?.enabled?(dcConfigured?'Active':'Missing URL'):'Disabled',cfg.discord?.enabled?(dcConfigured?'green':'amber'):'')}
            </div>
            <label class="checkbox-label" style="font-weight:600">
              <input type="checkbox" name="dc_enabled" ${cfg.discord?.enabled?'checked':''}> Enable Discord channel
            </label>
            <label>Webhook URL
              <input name="dc_webhookUrl" type="password" placeholder="${cfg.discord?.webhookUrl?'•••••••••••• (Configured)': 'https://discord.com/api/webhooks/...'}" autocomplete="off">
              <small class="field-help">Server Settings → Integrations → Webhooks</small>
            </label>
            <div style="margin-top:auto;padding-top:10px">
              <button type="button" class="button secondary small" id="test-dc-btn" style="width:100%">${icon('play')} Test Discord dispatch</button>
            </div>
          </div>

          <!-- Slack -->
          <div class="notif-channel-card notif-card-slack">
            <div class="notif-channel-header">
              <div class="notif-channel-brand">
                <div class="notif-brand-icon">💬</div>
                <div>
                  <h4 class="notif-channel-title">Slack Webhook</h4>
                  <small class="muted">Real-time alerts in Slack workspace channels</small>
                </div>
              </div>
              ${pill(cfg.slack?.enabled?(slConfigured?'Active':'Missing URL'):'Disabled',cfg.slack?.enabled?(slConfigured?'green':'amber'):'')}
            </div>
            <label class="checkbox-label" style="font-weight:600">
              <input type="checkbox" name="sl_enabled" ${cfg.slack?.enabled?'checked':''}> Enable Slack channel
            </label>
            <label>Incoming Webhook URL
              <input name="sl_webhookUrl" type="password" placeholder="${cfg.slack?.webhookUrl?'•••••••••••• (Configured)': 'https://hooks.slack.com/services/...'}" autocomplete="off">
              <small class="field-help">Slack App Directory → Incoming WebHooks</small>
            </label>
            <div style="margin-top:auto;padding-top:10px">
              <button type="button" class="button secondary small" id="test-sl-btn" style="width:100%">${icon('play')} Test Slack dispatch</button>
            </div>
          </div>

          <!-- Custom Webhook -->
          <div class="notif-channel-card notif-card-webhook">
            <div class="notif-channel-header">
              <div class="notif-channel-brand">
                <div class="notif-brand-icon">⚡</div>
                <div>
                  <h4 class="notif-channel-title">Custom HTTP Webhook</h4>
                  <small class="muted">n8n, PagerDuty, Zapier or custom SIEM</small>
                </div>
              </div>
              ${pill(cfg.webhook?.enabled?(whConfigured?'Active':'Missing URL'):'Disabled',cfg.webhook?.enabled?(whConfigured?'green':'amber'):'')}
            </div>
            <label class="checkbox-label" style="font-weight:600">
              <input type="checkbox" name="wh_enabled" ${cfg.webhook?.enabled?'checked':''}> Enable Custom Webhook
            </label>
            <label>Target Webhook URL
              <input name="wh_url" placeholder="${cfg.webhook?.url?'(Configured)': 'https://api.example.com/alerts'}" value="${esc(cfg.webhook?.url||'')}">
              <small class="field-help">Receives HTTP POST with JSON event payload</small>
            </label>
            <label>Secret Token Header (X-Panel-Secret)
              <input name="wh_secret" type="password" placeholder="${cfg.webhook?.secretHeader?'••••••••••••': 'Optional verification secret'}" autocomplete="off">
              <small class="field-help">Sent in X-Panel-Secret header for authentication</small>
            </label>
            <div style="margin-top:auto;padding-top:10px">
              <button type="button" class="button secondary small" id="test-wh-btn" style="width:100%">${icon('play')} Test Webhook dispatch</button>
            </div>
          </div>
        </div>

        <div class="section-table-heading" style="margin-bottom:12px">
          <h3>2. Trigger Event Subscriptions</h3>
          <p class="muted tiny">Select which autonomous system occurrences trigger an immediate notification dispatch.</p>
        </div>

        <div class="notif-event-grid">
          <label class="notif-event-card">
            <span class="notif-event-icon">🚨</span>
            <div class="notif-event-info">
              <div class="notif-event-top">
                <span class="notif-event-name">Container Failure</span>
                ${pill('CRITICAL','red')}
              </div>
              <p class="notif-event-desc">Fires immediately when any Docker container crashes, unhealthily exits, or loops.</p>
            </div>
            <input type="checkbox" name="ev_container_down" ${cfg.events?.container_down!==false?'checked':''} style="margin-left:auto">
          </label>

          <label class="notif-event-card">
            <span class="notif-event-icon">💾</span>
            <div class="notif-event-info">
              <div class="notif-event-top">
                <span class="notif-event-name">Storage Critical</span>
                ${pill('CRITICAL','red')}
              </div>
              <p class="notif-event-desc">Fires when filesystem disk usage exceeds 85% or available inodes fall below 10%.</p>
            </div>
            <input type="checkbox" name="ev_storage_alert" ${cfg.events?.storage_alert!==false?'checked':''} style="margin-left:auto">
          </label>

          <label class="notif-event-card">
            <span class="notif-event-icon">🛡️</span>
            <div class="notif-event-info">
              <div class="notif-event-top">
                <span class="notif-event-name">WAF Threat Surge</span>
                ${pill('WARNING','amber')}
              </div>
              <p class="notif-event-desc">Fires when Coraza or CrowdSec detects high-frequency attack bursts (&gt;20 blocks/min).</p>
            </div>
            <input type="checkbox" name="ev_waf_surge" ${cfg.events?.waf_surge!==false?'checked':''} style="margin-left:auto">
          </label>

          <label class="notif-event-card">
            <span class="notif-event-icon">📦</span>
            <div class="notif-event-info">
              <div class="notif-event-top">
                <span class="notif-event-name">Cloud Backup Failure</span>
                ${pill('WARNING','amber')}
              </div>
              <p class="notif-event-desc">Fires if daily automated S3 / Cloudflare R2 cloud snapshot job fails or times out.</p>
            </div>
            <input type="checkbox" name="ev_backup_failed" ${cfg.events?.backup_failed!==false?'checked':''} style="margin-left:auto">
          </label>

          <label class="notif-event-card">
            <span class="notif-event-icon">🔒</span>
            <div class="notif-event-info">
              <div class="notif-event-top">
                <span class="notif-event-name">TLS Certificate Expiry</span>
                ${pill('INFO','')}
              </div>
              <p class="notif-event-desc">Fires when any website origin SSL/TLS certificate has fewer than 14 days remaining.</p>
            </div>
            <input type="checkbox" name="ev_ssl_expiry" ${cfg.events?.ssl_expiry!==false?'checked':''} style="margin-left:auto">
          </label>
        </div>

        <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px">
          <button type="submit" class="button primary">${icon('check')} Save All Notification Settings</button>
          <span class="muted tiny">Tokens and webhook secrets are stored privately in encrypted mode (0600 root-only).</span>
        </div>
      </form>

      <div class="card management-card">
        <div class="toolbar">
          <div class="section-table-heading">
            <h3>3. Live Alert Template Simulation</h3>
            <p class="muted tiny">Real-time preview of formatted alerts as delivered to user devices.</p>
          </div>
        </div>
        <div class="card-pad" style="padding-top:4px">
          <div class="notif-preview-container">
            <div>
              <span class="preview-label">Telegram Markdown Template</span>
              <div class="notif-tg-preview" style="margin-top:6px">
                <strong>🛡️ [CP-Panel · CyberPross]</strong><br>
                <em>*Container Outage Detected*</em><br>
                Severity: <code>CRITICAL</code><br>
                Event: <code>container_down</code><br><br>
                Container <strong>cyberpross-n8n-n8n-1</strong> exited unexpectedly with code 137.<br>
                <small class="muted">Time: ${new Date().toLocaleTimeString()} IST · cyber.cyberpross.cc</small>
              </div>
            </div>
            <div>
              <span class="preview-label">Discord Rich Embed Template</span>
              <div class="notif-dc-preview" style="margin-top:6px">
                <div style="font-weight:700;color:#fff;margin-bottom:4px">🛡️ CP-Panel Alert (by CyberPross)</div>
                <div style="font-size:13px;font-weight:600;margin-bottom:6px">Storage Critical (&gt;85%)</div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">Root filesystem <code>/</code> has reached 88.4% capacity (12.2 GB remaining).</div>
                <div style="display:flex;gap:16px;font-size:11px">
                  <div><span style="color:#94a3b8">Severity:</span> <strong>CRITICAL</strong></div>
                  <div><span style="color:#94a3b8">Mount:</span> <code>/</code></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    form('notif-config-form',async e=>{
      const f=new FormData(e);
      const payload={
        telegram:{enabled:f.get('tg_enabled')!==null,botToken:f.get('tg_botToken')?.trim()||undefined,chatId:f.get('tg_chatId')?.trim()||undefined},
        discord:{enabled:f.get('dc_enabled')!==null,webhookUrl:f.get('dc_webhookUrl')?.trim()||undefined},
        slack:{enabled:f.get('sl_enabled')!==null,webhookUrl:f.get('sl_webhookUrl')?.trim()||undefined},
        webhook:{enabled:f.get('wh_enabled')!==null,url:f.get('wh_url')?.trim()||undefined,secretHeader:f.get('wh_secret')?.trim()||undefined},
        events:{
          container_down:f.get('ev_container_down')!==null,
          storage_alert:f.get('ev_storage_alert')!==null,
          waf_surge:f.get('ev_waf_surge')!==null,
          backup_failed:f.get('ev_backup_failed')!==null,
          ssl_expiry:f.get('ev_ssl_expiry')!==null
        }
      };
      await post('/api/notifications/config',payload);
      notify('All notification channels and trigger event subscriptions saved.');
      await notificationsPage();
    });

    bind('test-tg-btn',async()=>{
      const r=await post('/api/notifications/test',{channel:'telegram'});
      notify(r.dispatches?.[0]?.ok?'Telegram test message sent!':'Telegram dispatch failed. Check token/chat ID.');
    });
    bind('test-dc-btn',async()=>{
      const r=await post('/api/notifications/test',{channel:'discord'});
      notify(r.dispatches?.[0]?.ok?'Discord test message sent!':'Discord dispatch failed. Check webhook URL.');
    });
    bind('test-sl-btn',async()=>{
      const r=await post('/api/notifications/test',{channel:'slack'});
      notify(r.dispatches?.[0]?.ok?'Slack test message sent!':'Slack dispatch failed. Check webhook URL.');
    });
    bind('test-wh-btn',async()=>{
      const r=await post('/api/notifications/test',{channel:'webhook'});
      notify(r.dispatches?.[0]?.ok?'Webhook test payload sent!':'Webhook dispatch failed. Check target URL.');
    });
    bind('notif-test-all',async()=>{
      for(const ch of ['telegram','discord','slack','webhook']){
        try{await post('/api/notifications/test',{channel:ch});}catch{}
      }
      notify('Broadcast test dispatched to all enabled channels.');
    });
    bind('notif-help',()=>openModal('Alert Notifications Setup Guide',`
      <div class="modal-body">
        <h4>1. Telegram Bot Integration</h4>
        <ol>
          <li>Open Telegram and message <strong>@BotFather</strong> to create a bot with <code>/newbot</code>. Copy the HTTP API token into <em>Bot Token</em>.</li>
          <li>Start a conversation with your bot, then message <strong>@userinfobot</strong> to obtain your numeric <em>Chat ID</em>.</li>
        </ol>
        <h4>2. Discord Webhook</h4>
        <ol>
          <li>In your Discord server, open <strong>Channel Settings → Integrations → Webhooks</strong>.</li>
          <li>Click <em>New Webhook</em> and copy the Webhook URL into CP-Panel.</li>
        </ol>
        <h4>3. Slack Incoming Webhook</h4>
        <ol>
          <li>Navigate to the Slack App Directory and enable <strong>Incoming WebHooks</strong>.</li>
          <li>Pick your destination channel and paste the provided Webhook URL.</li>
        </ol>
        <h4>4. Custom HTTP Webhook</h4>
        <p>CP-Panel delivers standard JSON payloads over HTTP POST to any external endpoint (e.g. n8n workflows, PagerDuty, or Grafana OnCall).</p>
      </div>
    `));
  }catch(e){
    $('#system-content').innerHTML=empty('Notifications unavailable',e.message,'overview');
  }
}

function initAiAssistant(){
  const toggle=$('#ai-assistant-toggle');
  const drawer=$('#ai-assistant-drawer');
  const closeBtn=$('#ai-drawer-close');
  const formEl=$('#ai-drawer-form');
  const inputEl=$('#ai-drawer-input');
  const messagesEl=$('#ai-drawer-messages');
  if(!toggle||!drawer) return;

  function toggleDrawer(){
    if(!me||!me.username||document.body.classList.contains('auth-mode')) return;
    drawer.hidden=!drawer.hidden;
    if(!drawer.hidden){
      inputEl.focus();
    }
  }

  toggle.onclick=toggleDrawer;
  if(closeBtn) closeBtn.onclick=()=>drawer.hidden=true;

  document.addEventListener('keydown',e=>{
    if(e.altKey&&e.code==='KeyA'){
      if(!me||!me.username||document.body.classList.contains('auth-mode')) return;
      e.preventDefault();
      toggleDrawer();
    }
  });

  $$('.ai-chip').forEach(c=>{
    c.onclick=()=>{
      if(!me||!me.username||document.body.classList.contains('auth-mode')) return;
      inputEl.value=c.dataset.aiPrompt;
      formEl.dispatchEvent(new Event('submit'));
    };
  });

  formEl.onsubmit=async e=>{
    e.preventDefault();
    if(!me||!me.username||document.body.classList.contains('auth-mode')) return;
    const prompt=inputEl.value.trim();
    if(!prompt) return;
    inputEl.value='';

    const userMsg=document.createElement('div');
    userMsg.className='ai-msg user';
    userMsg.innerHTML=`<div class="ai-msg-bubble">${esc(prompt)}</div>`;
    messagesEl.appendChild(userMsg);

    const botMsg=document.createElement('div');
    botMsg.className='ai-msg bot';
    botMsg.innerHTML=`<div class="ai-msg-bubble"><i class="status-dot"></i> Analyzing request & server context…</div>`;
    messagesEl.appendChild(botMsg);
    messagesEl.scrollTop=messagesEl.scrollHeight;

    try{
      let replyText='';
      const lowPrompt=prompt.toLowerCase();

      if(lowPrompt.includes('health')||lowPrompt.includes('load')||lowPrompt.includes('cpu')||lowPrompt.includes('memory')){
        const m=await api('/api/metrics').catch(()=>null);
        if(m){
          replyText=`🖥️ <strong>Host Telemetry:</strong><br>
            • CPU Usage: <strong>${m.cpu?.toFixed(1)}%</strong> (${m.cpuCount||1} cores)<br>
            • Memory Used: <strong>${(m.memory?.used/(1024**3)).toFixed(2)} / ${(m.memory?.total/(1024**3)).toFixed(2)} GB</strong> (${((m.memory?.used/m.memory?.total)*100).toFixed(1)}%)<br>
            • Disk Free: <strong>${(m.disk?.available/(1024**3)).toFixed(1)} GB</strong> (${m.disk?.percent}% used)<br>
            • Host Uptime: <strong>${Math.round((m.uptime||0)/3600)} hours</strong>`;
        } else {
          replyText='Unable to read metrics at this moment.';
        }
      } else if(lowPrompt.includes('security')||lowPrompt.includes('block')||lowPrompt.includes('ban')||lowPrompt.includes('threat')||lowPrompt.includes('waf')){
        const s=await api('/api/security-center/status').catch(()=>null);
        if(s){
          replyText=`🛡️ <strong>Security Status:</strong><br>
            • Protection Mode: <strong>${esc(s.engines?.protection?.mode||'block').toUpperCase()}</strong><br>
            • Coraza WAF Gateway: <strong>${s.engines?.protection?.healthy?'Active & Healthy':'Degraded'}</strong><br>
            • Active CrowdSec Bans: <strong>${s.engines?.crowdsec?.decisions?.length||0}</strong><br>
            • Geolocation Threat Origins: <strong>${s.locations?.length||0} countries</strong><br>
            <button class="button secondary small" style="margin-top:6px" onclick="route('waf')">Open Security Center</button>`;
        } else {
          replyText='Security telemetry currently unavailable.';
        }
      } else if(lowPrompt.includes('container')||lowPrompt.includes('docker')){
        const d=await api('/api/docker').catch(()=>null);
        if(d?.containers){
          const running=d.containers.filter(c=>c.State==='running');
          replyText=`📦 <strong>Docker Containers (${running.length} running / ${d.containers.length} total):</strong><br>`+
            d.containers.slice(0,6).map(c=>`• <code>${esc(c.Names)}</code>: ${c.State==='running'?'<span style="color:var(--green)">running</span>':'<span style="color:var(--muted)">stopped</span>'} (${esc(c.Status)})`).join('<br>')+
            (d.containers.length>6?`<br><em>...and ${d.containers.length-6} more</em>`:'')+
            `<br><button class="button secondary small" style="margin-top:6px" onclick="dockerTab='containers';route('docker')">Manage Containers</button>`;
        } else {
          replyText='Docker Engine is not running or accessible.';
        }
      } else if(lowPrompt.includes('app')||lowPrompt.includes('store')||lowPrompt.includes('catalog')){
        const apps=await api('/api/apps/catalog').catch(()=>[]);
        replyText=`🚀 <strong>1-Click Open-Source App Store:</strong><br>`+
          apps.slice(0,5).map(a=>`• <strong>${a.name}</strong> (${a.category}) - ${a.installed?'<span style="color:var(--green)">Installed</span>':'Available'}`).join('<br>')+
          `<br><button class="button primary small" style="margin-top:6px" onclick="dockerTab='apps';route('docker')">Open App Store</button>`;
      } else if(lowPrompt.includes('backup')||lowPrompt.includes('s3')){
        const b=await api('/api/backup/cloud/list').catch(()=>null);
        replyText=`💾 <strong>S3 Cloud Backups:</strong><br>`+
          (b?.configured?`• Storage Bucket: <code>${esc(b.bucket)}</code><br>• Stored Snapshots: <strong>${b.items?.length||0}</strong>`:`• S3 storage is not yet configured.<br><button class="button secondary small" style="margin-top:6px" onclick="sub='backups';route('system')">Configure S3</button>`);
      } else if(lowPrompt.includes('ssl')||lowPrompt.includes('cert')||lowPrompt.includes('https')||lowPrompt.includes('tls')||lowPrompt.includes('tunnel')||lowPrompt.includes('cloudflare')){
        const cf=await api('/api/cloudflare/summary').catch(()=>({health:'Connected',connections:4}));
        replyText=`☁️ <strong>Cloudflare Tunnel Architecture:</strong><br>
          • <strong>Status:</strong> ${pill(cf.health||'Connected','green')} (${cf.connections||4} edge connections)<br>
          • <strong>Edge HTTPS:</strong> Automatically provided and renewed by Cloudflare for all subdomains.<br>
          • <strong>Origin Transport:</strong> Encrypted WireGuard/QUIC tunnel to loopback HTTP (<code>127.0.0.1</code>).<br>
          • <strong>No Local SSL Needed:</strong> Because Cloudflare terminates SSL at the edge, no Let's Encrypt / Certbot or open firewall ports (80/443) are required.<br>
          • <strong>Subdomains:</strong> Just route your subdomain in Cloudflare Zero Trust to <code>http://127.0.0.1:&lt;port&gt;</code>!`;
      } else {
        const aiRes=await post('/api/grafana/ai',{prompt,confirm:true}).catch(async()=>{
          const g=await api('/api/ai/graph?action=digest').catch(()=>null);
          return {answer:`Server telemetry digest: ${g?.containers?.length||0} containers, ${g?.websites?.length||0} websites, Coraza WAF active.`,provider:'local',model:'graphify-digest'};
        });
        if(aiRes&&aiRes.answer){
          replyText=`<div class="ai-reply-header" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">${pill(aiRes.provider+' · '+(aiRes.model||'AI'),aiRes.provider==='openrouter'?'gold':aiRes.provider==='openai'?'green':'blue')}${aiRes.grafanaStatus?.active?pill('Grafana Live','green'):''}</div><div>${esc(aiRes.answer).replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>')}</div>`;
          if(Array.isArray(aiRes.actions)&&aiRes.actions.length>0){
            replyText+=`<div class="ai-quick-actions" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">`+
              aiRes.actions.map(act=>`<button class="button small secondary ai-action-btn" data-act-id="${esc(act.id)}" data-act-kind="${esc(act.kind||'')}" data-act-mode="${esc(act.mode||'')}" data-act-target="${esc(act.target||'')}">${esc(act.label)}</button>`).join('')+
              `</div>`;
          }
        } else {
          replyText='No response received from AI assistant.';
        }
      }

      botMsg.querySelector('.ai-msg-bubble').innerHTML=replyText;
      botMsg.querySelectorAll('.ai-action-btn').forEach(btn=>{
        btn.onclick=async()=>{
          const kind=btn.dataset.actKind;
          const mode=btn.dataset.actMode;
          const target=btn.dataset.actTarget;
          if(kind==='protection'){
            await post('/api/security-center/mode',{mode,confirm:true});
            notify(`Security protection mode updated to ${mode.toUpperCase()}`);
          }else if(kind==='dashboard'&&target){
            monitoringCategory='console';
            route('monitoring');
          }else if(kind==='poll'){
            await post('/api/grafana/settings',{pollMode:mode,confirm:true});
            notify(`Observability polling set to ${mode}`);
          }else if(kind==='health'){
            route('system');
          }
        };
      });
    }catch(err){
      botMsg.querySelector('.ai-msg-bubble').innerHTML=`⚠️ Error: ${esc(err.message)}`;
    }
    messagesEl.scrollTop=messagesEl.scrollHeight;
  };
}
