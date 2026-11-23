/** Persistent menu, battle and battle-danger music, separate from the render tree.
 * sync({scene, enabled, volume: 0..1, visible}); defaults to ON at 50%.
 * Call unlock() once to attempt autoplay, then on user gestures to retry when
 * browser policy blocks it. unlocked records an attempt, not granted permission.
 * Audio and lifecycle factories are injectable so behavior can be tested without
 * downloading tracks. The controller never rewinds an element during playback.
 */
export function createMusicController(options={}) {
  const doc=options.document ?? globalThis.document;
  const win=options.window ?? globalThis.window;
  const sources={menu:'assets/audio/menu.mp3',battle:'assets/audio/battle.mp3','battle-danger':'assets/audio/battle-danger.mp3',...options.sources};
  const prefix=options.idPrefix || 'beastking-bgm';
  const onstate=typeof options.onstate==='function'?options.onstate:()=>{};
  const audioFactory=options.createAudio || (()=>doc?.createElement('audio'));
  const contextFactory=options.audioContextFactory || (()=>{
    const Constructor=win?.AudioContext || win?.webkitAudioContext;
    return Constructor?new Constructor():null;
  });
  const config={scene:'menu',enabled:true,volume:0.5,visible:!(doc?.hidden || doc?.visibilityState==='hidden')};
  const entries=new Map(), listeners=[];
  let unlocked=false,destroyed=false,pageHidden=false,manualPaused=false;
  let status='locked',blocked=false,error=null,needsRetry=false,serial=0,attempt=null;
  let context=null,gain=null,contextAttempted=false,lastNotification='';
  const noop=()=>{};
  const listen=(target,type,fn)=>{if(target?.addEventListener){target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));}};
  const visible=()=>config.visible&&!pageHidden&&!doc?.hidden&&doc?.visibilityState!=='hidden';
  const eligible=()=>!destroyed&&config.enabled&&unlocked&&visible()&&!manualPaused;
  const active=()=>entries.get(config.scene);
  const graphRunning=entry=>!entry?.source || context?.state==='running';
  const clamp=value=>Math.max(0,Math.min(1,value));

  function getState() {
    const entry=active();
    return {scene:config.scene,enabled:config.enabled,volume:config.volume,visible:visible(),unlocked,
      playing:eligible()&&status==='playing'&&!entry?.audio.paused&&graphRunning(entry),
      blocked,status,error,gainMode:entry?.source?'web-audio':'media-element'};
  }
  function emit() {
    const state=getState(),signature=JSON.stringify(state);
    if(signature===lastNotification)return;
    lastNotification=signature;
    try{onstate(state);}catch{/* UI errors must not interrupt media cleanup. */}
  }
  function safelyPause(entry,force=false) {
    if(!entry)return;
    if(force || !entry.audio.paused || attempt?.entry===entry) {
      if(!entry.audio.paused)entry.ignoredPauses++;
      try{entry.audio.pause();}catch{}
    }
  }
  function halt() {
    const pending=attempt;serial++;attempt=null;
    for(const entry of entries.values()) safelyPause(entry,pending?.entry===entry);
  }
  function updateVolumes() {
    if(gain) {
      try{gain.gain.setValueAtTime(config.volume,context.currentTime);}catch{try{gain.gain.value=config.volume;}catch{}}
    }
    for(const entry of entries.values()) {
      try{entry.audio.volume=entry.source?1:config.volume;}catch{}
      // Muted is supported even on platforms that ignore element.volume.
      entry.audio.muted=config.volume===0;
      entry.audio.setAttribute?.('data-bgm-volume',String(config.volume));
      entry.audio.setAttribute?.('data-gain-mode',entry.source?'web-audio':'media-element');
    }
  }
  function createGraph() {
    if(contextAttempted || options.useWebAudioGain===false)return;
    contextAttempted=true;
    try {
      context=contextFactory();
      if(!context)return;
      gain=context.createGain();gain.connect(context.destination);
      for(const entry of entries.values()) {
        try{entry.source=context.createMediaElementSource(entry.audio);entry.source.connect(gain);}catch{entry.source=null;}
      }
      listen(context,'statechange',()=>{
        if(destroyed)return;
        const entry=active();
        if(context.state==='running') {
          if(eligible()&&!entry.audio.paused){status='playing';blocked=false;error=null;needsRetry=false;}
        } else if(entry.source && eligible()&&!entry.audio.paused) {
          // A device interruption must not silently run a track's clock forever.
          safelyPause(entry);needsRetry=true;status='paused';
        }
        emit();
      });
    } catch {
      try{Promise.resolve(context?.close?.()).catch(noop);}catch{}
      context=null;gain=null;
    }
    updateVolumes();
  }
  function resumeGraph() {
    if(!context || context.state==='running' || context.state==='closed')return true;
    try {
      const resumed=context.resume();
      Promise.resolve(resumed).then(()=>{
        if(destroyed)return;
        const entry=active();
        if(eligible()&&!entry.audio.paused&&graphRunning(entry)){status='playing';blocked=false;error=null;needsRetry=false;emit();}
      }).catch(reason=>{
        if(destroyed || !eligible() || context?.state==='running')return;
        if(active()?.source){safelyPause(active());needsRetry=true;blocked=true;status='blocked';error=String(reason?.name||'AudioContextBlocked');emit();}
      });
    }catch(reason){
      if(active()?.source){safelyPause(active());needsRetry=true;blocked=true;status='blocked';error=String(reason?.name||'AudioContextBlocked');return false;}
    }
    return true;
  }
  function reconcile(retry=false) {
    if(destroyed)return getState();
    updateVolumes();
    if(!eligible()) {
      halt();blocked=false;error=null;
      status=!config.enabled?'off':!visible()?'hidden':!unlocked?'locked':'paused';
      emit();return getState();
    }
    const entry=active();
    for(const other of entries.values()) if(other!==entry)safelyPause(other,true);
    if(retry){needsRetry=false;blocked=false;error=null;}
    if(needsRetry && !retry){emit();return getState();}
    createGraph();
    if(!resumeGraph()){emit();return getState();}
    if(attempt?.entry===entry){emit();return getState();}
    if(!entry.audio.paused) {
      status=graphRunning(entry)?'playing':'loading';emit();return getState();
    }
    const token=++serial;
    attempt={token,entry};status='loading';blocked=false;error=null;emit();
    let request;
    try{request=entry.audio.play();}catch(reason){settledFailure(token,entry,reason);return getState();}
    Promise.resolve(request).then(()=>{
      if(destroyed || token!==serial || !eligible() || active()!==entry) {
        if(destroyed || !eligible() || active()!==entry)safelyPause(entry,true);
        return;
      }
      attempt=null;
      if(entry.audio.paused){status='paused';needsRetry=true;}
      else{status=graphRunning(entry)?'playing':'loading';blocked=false;error=null;needsRetry=false;}
      emit();
    },reason=>settledFailure(token,entry,reason));
    return getState();
  }
  function settledFailure(token,entry,reason) {
    if(destroyed || token!==serial || active()!==entry || !eligible())return;
    attempt=null;needsRetry=true;
    blocked=reason?.name==='NotAllowedError';
    error=String(reason?.name||'PlaybackError');
    status=blocked?'blocked':reason?.name==='AbortError'?'paused':'error';
    safelyPause(entry,true);emit();
  }

  for(const scene of ['menu','battle','battle-danger']) {
    const audio=audioFactory(scene,sources[scene]);
    if(!audio || typeof audio.play!=='function' || typeof audio.pause!=='function')throw new TypeError('A playable audio element is required.');
    audio.id=`${prefix}-${scene}`;audio.loop=true;audio.preload='none';audio.autoplay=false;audio.controls=false;audio.hidden=true;
    audio.setAttribute?.('data-scene',scene);audio.setAttribute?.('data-bgm','true');audio.setAttribute?.('aria-hidden','true');audio.setAttribute?.('playsinline','');
    audio.src=sources[scene];
    const entry={scene,audio,source:null,ignoredPauses:0};entries.set(scene,entry);
    (options.container ?? doc?.body ?? doc?.documentElement)?.appendChild?.(audio);
    listen(audio,'playing',()=>{
      if(destroyed || active()!==entry || !eligible()){safelyPause(entry,true);return;}
      status=graphRunning(entry)?'playing':'loading';blocked=false;error=null;needsRetry=false;emit();
    });
    listen(audio,'pause',()=>{
      if(entry.ignoredPauses){entry.ignoredPauses--;return;}
      if(destroyed || active()!==entry)return;
      if(eligible()&&!attempt){status='paused';needsRetry=true;}
      emit();
    });
    listen(audio,'error',()=>{
      if(destroyed || active()!==entry || !config.enabled)return;
      attempt=null;serial++;needsRetry=true;blocked=false;status='error';
      error=`MediaError${audio.error?.code||''}`;emit();
    });
  }
  if(options.autoVisibility!==false) {
    listen(doc,'visibilitychange',()=>{
      config.visible=!(doc.hidden || doc.visibilityState==='hidden');
      if(config.visible)manualPaused=false;
      reconcile(config.visible);
    });
    listen(win,'pagehide',()=>{pageHidden=true;reconcile();});
    listen(win,'pageshow',()=>{pageHidden=false;config.visible=!(doc?.hidden || doc?.visibilityState==='hidden');manualPaused=false;reconcile(true);});
  }
  updateVolumes();

  return {
    sync(next={}) {
      if(destroyed)return getState();
      const previous={...config};
      if(entries.has(next.scene))config.scene=next.scene;
      if(typeof next.enabled==='boolean')config.enabled=next.enabled;
      if(typeof next.volume==='number'&&Number.isFinite(next.volume))config.volume=clamp(next.volume);
      if(typeof next.visible==='boolean')config.visible=next.visible;
      const changed=previous.scene!==config.scene||previous.enabled!==config.enabled||previous.visible!==config.visible;
      if(changed){halt();manualPaused=false;needsRetry=false;}
      return reconcile(changed);
    },
    unlock() {
      if(destroyed)return getState();
      unlocked=true;manualPaused=false;
      // Both resume() and play() are called synchronously inside this gesture.
      return reconcile(true);
    },
    pause() {
      if(destroyed)return getState();
      manualPaused=true;return reconcile();
    },
    getState,
    destroy() {
      if(destroyed)return getState();
      destroyed=true;halt();
      for(const remove of listeners.splice(0))remove();
      for(const entry of entries.values()) {
        try{entry.source?.disconnect();}catch{}
        try{entry.audio.removeAttribute?.('src');entry.audio.load?.();entry.audio.remove?.();}catch{}
      }
      try{gain?.disconnect();}catch{}
      try{Promise.resolve(context?.close?.()).catch(noop);}catch{}
      status='destroyed';blocked=false;error=null;emit();return getState();
    }
  };
}
