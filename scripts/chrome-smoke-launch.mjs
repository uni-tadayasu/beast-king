/** Shared, bounded Chrome startup for the two real browser tests.
 * A failed launch is not a passed test. Keep diagnostics and retry only
 * infrastructure initialization, never an application assertion.
 */
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export async function stopSmokeChrome(session){
 if(!session)return;
 const {proc,ws,profileDir}=session;
 try{ws?.close()}catch{}
 if(proc&&proc.exitCode===null&&proc.signalCode===null){
  proc.kill('SIGTERM');
  for(let i=0;i<30&&proc.exitCode===null&&proc.signalCode===null;i++)await delay(100);
  if(proc.exitCode===null&&proc.signalCode===null){
   proc.kill('SIGKILL');
   for(let i=0;i<20&&proc.exitCode===null&&proc.signalCode===null;i++)await delay(100);
  }
 }
 if(profileDir)await rm(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
async function connectSocket(url){
 const ws=new WebSocket(url);
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('DevTools WebSocket handshake timed out')),8000);
   ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('DevTools WebSocket connection failed'))},{once:true});
   ws.addEventListener('close',()=>{clearTimeout(timer);reject(Error('DevTools WebSocket closed before connection'))},{once:true});
  });
  return ws;
 }catch(error){try{ws.close()}catch{}throw error;}
}
export async function launchSmokeChrome(){
 const candidates=[...new Set([process.env.CHROME_BIN,'google-chrome-stable','google-chrome','chromium','chromium-browser'].filter(Boolean))];
 const available=candidates.filter(bin=>spawnSync(bin,['--version'],{stdio:'ignore',timeout:8000}).status===0);
 if(!available.length)throw Error('Chrome/Chromium must be installed for browser smoke tests. Tried: '+candidates.join(', '));
 const failures=[];
 for(let attempt=1;attempt<=3;attempt++){
  const chrome=available[(attempt-1)%available.length],profileDir=await mkdtemp(join(tmpdir(),'bk-browser-'));
  const session={profileDir,proc:null,ws:null};
  let stderr='',spawnError=null;
  try{
   const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-extensions','--no-first-run','--no-default-browser-check','--mute-audio','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profileDir,'about:blank'];
   const proc=spawn(chrome,args,{stdio:['ignore','ignore','pipe']});session.proc=proc;
   proc.on('error',error=>{spawnError=error});
   proc.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-12000)});
   const end=Date.now()+30000;
   let lastError='waiting for DevToolsActivePort';
   while(Date.now()<end){
    if(spawnError)throw spawnError;
    if(proc.exitCode!==null||proc.signalCode!==null)throw Error('Chrome exited: '+(proc.exitCode??proc.signalCode));
    try{
     const file=await readFile(join(profileDir,'DevToolsActivePort'),'utf8');
     const port=Number(file.split('\n')[0]);
     if(!Number.isInteger(port)||port<1||port>65535)throw Error('DevTools port file is incomplete');
     const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(2500)});
     if(!response.ok)throw Error('DevTools HTTP '+response.status);
     const page=(await response.json()).find(x=>x.type==='page'&&typeof x.webSocketDebuggerUrl==='string');
     if(!page)throw Error('DevTools page is not ready');
     session.ws=await connectSocket(page.webSocketDebuggerUrl);
     console.log('Chrome ready ('+chrome+', attempt '+attempt+')');
     return session;
    }catch(error){lastError=error.message;}
    await delay(200);
   }
   throw Error('Timed out waiting for Chrome DevTools: '+lastError);
  }catch(error){
   const detail='Chrome startup '+attempt+'/3 ('+chrome+'): '+error.message+(stderr?'\n'+stderr:'');
   failures.push(detail);console.warn(detail);
   await stopSmokeChrome(session);
   if(attempt<3)await delay(1000*attempt);
  }
 }
 throw Error('Chrome could not start after three attempts.\n'+failures.join('\n---\n'));
}
