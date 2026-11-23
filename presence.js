/** Visible game sessions renew a short server lease. This is never an
 * authorization signal: player presence lists remain operator-only. */
export function createPresenceController({client,documentImpl=globalThis.document,windowImpl=globalThis.window,timers={setTimeout:globalThis.setTimeout.bind(globalThis),clearTimeout:globalThis.clearTimeout.bind(globalThis)},intervalMs=30000}={}){
  let active=false,owner=null,epoch=0,timer=null,loginPending=false,tail=Promise.resolve();
  const visible=()=>!documentImpl||(!documentImpl.hidden&&documentImpl.visibilityState!=='hidden');
  const clear=()=>{if(timer!==null)timers.clearTimeout(timer);timer=null;};
  function send(online,login=false){
    const version=epoch,id=owner;
    const task=tail.catch(()=>{}).then(async()=>{
      if(version!==epoch||!id||client.profile?.id!==id)return;
      try{
        const result=await client.updatePresence({online,login:online&&login},{keepalive:!online});
        if(version===epoch&&online&&login)loginPending=false;
        return result;
      }catch(error){if(version===epoch&&error?.status===401){active=false;clear();}}
    });
    tail=task;return task;
  }
  function schedule(){
    clear();if(!active||!visible())return;
    timer=timers.setTimeout(()=>{timer=null;void tick();},Math.max(10000,intervalMs));
  }
  async function tick(){
    if(!active)return;
    if(client.profile?.id!==owner){stop(false);return;}
    await send(visible(),loginPending);schedule();
  }
  function start(){
    const id=client.profile?.id;if(!id)return Promise.resolve();
    if(active&&owner===id)return Promise.resolve();
    clear();epoch+=1;active=true;owner=id;loginPending=true;return tick();
  }
  function stop(notify=true){
    clear();active=false;epoch+=1;return notify?send(false):Promise.resolve();
  }
  function visibility(){if(!active)return;clear();if(visible())void tick();else void send(false);}
  function online(){if(active&&visible())void tick();}
  function pagehide(){void stop(true);}
  documentImpl?.addEventListener?.('visibilitychange',visibility);
  windowImpl?.addEventListener?.('online',online);
  windowImpl?.addEventListener?.('pagehide',pagehide);
  return {
    start,stop,
    destroy(){void stop(true);documentImpl?.removeEventListener?.('visibilitychange',visibility);windowImpl?.removeEventListener?.('online',online);windowImpl?.removeEventListener?.('pagehide',pagehide);},
  };
}
