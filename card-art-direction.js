/** A shared, non-destructive ink/paint finish for the original atlas collection.
 * Only the illustration layer consumes this filter. Rules, numbers, foil and
 * authenticated Regalia artwork are never filtered. Redrawn atlases use the
 * lighter colour finish in CSS; this is not a claim to redraw the whole catalog.
 */
const SVG_NS='http://www.w3.org/2000/svg';
const FILTER_ID='bk-card-painted-ink';

export function installCardArtDirection(doc=globalThis.document){
 if(!doc?.body||doc.getElementById(FILTER_ID))return false;
 const svg=doc.createElementNS(SVG_NS,'svg');
 svg.setAttribute('class','card-art-filter-definitions');
 svg.setAttribute('aria-hidden','true');
 svg.setAttribute('focusable','false');
 svg.setAttribute('width','0');svg.setAttribute('height','0');
 const steps=Array.from({length:14},(_,i)=>(i/13).toFixed(4)).join(' ');
 svg.innerHTML=`<defs><filter id="${FILTER_ID}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="paint"/>
  <feColorMatrix in="paint" type="saturate" values="1.12" result="pigment"/>
  <feComponentTransfer in="pigment" result="tones"><feFuncR type="discrete" tableValues="${steps}"/><feFuncG type="discrete" tableValues="${steps}"/><feFuncB type="discrete" tableValues="${steps}"/></feComponentTransfer>
  <feConvolveMatrix in="paint" order="3" kernelMatrix="0 -1 0 -1 4 -1 0 -1 0" divisor="1" preserveAlpha="true" result="edges"/>
  <feColorMatrix in="edges" type="luminanceToAlpha" result="edgeAlpha"/>
  <feComponentTransfer in="edgeAlpha" result="inkAlpha"><feFuncA type="linear" slope="1.05" intercept="-0.025"/></feComponentTransfer>
  <feFlood flood-color="#17263f" result="ink"/>
  <feComposite in="ink" in2="inkAlpha" operator="in" result="linework"/>
  <feBlend in="tones" in2="linework" mode="multiply"/>
 </filter></defs>`;
 doc.body.prepend(svg);
 doc.documentElement.dataset.cardArtDirection='painted-ink';
 return true;
}

if(typeof document!=='undefined')installCardArtDirection(document);
