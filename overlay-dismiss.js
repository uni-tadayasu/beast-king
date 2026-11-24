/** A tap outside dismisses only the current layer, never the control behind it. */
export function bindOutsideDismiss(root,{getLayer,isOutside=(event,layer)=>!layer.contains(event.target),onDismiss}){
 let press=null;
 const start=event=>{
  const layer=getLayer();
  press=layer?{layer,outside:event.button===0&&event.isPrimary!==false&&isOutside(event,layer),x:event.clientX,y:event.clientY}:null;
 };
 const cancel=()=>{press=null;};
 const click=event=>{
  const began=press;press=null;
  const layer=getLayer();
  if(!layer||event.button>0||!isOutside(event,layer))return;
  // Starting inside, dragging across the border, or replacing the dialog during
  // a press must not dismiss it. detail=0 retains assistive click activation.
  if(began){
   if(began.layer!==layer||!began.outside||Math.hypot(event.clientX-began.x,event.clientY-began.y)>12)return;
  }else if(event.detail!==0)return;
  event.preventDefault();event.stopImmediatePropagation();onDismiss(layer);
 };
 root.addEventListener('pointerdown',start,true);
 root.addEventListener('pointercancel',cancel,true);
 root.addEventListener('click',click,true);
 return ()=>{
  cancel();root.removeEventListener('pointerdown',start,true);
  root.removeEventListener('pointercancel',cancel,true);root.removeEventListener('click',click,true);
 };
}

/** Native dialogs retarget backdrop events to the dialog itself. */
export function isDialogBackdrop(event,dialog){
 if(event.target!==dialog)return false;
 const rect=dialog.getBoundingClientRect();
 return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
}
