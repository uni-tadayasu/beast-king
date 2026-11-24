/** Lossless pages for bounded, scroll-free reading panels. Budgets count
 * Unicode code points so an emoji or a supplementary kanji is never cut into
 * two surrogate halves. Punctuation and whitespace stay in the returned text. */
const DEFAULT_PAGE_CHARACTERS=200;
const MAX_PAGE_CHARACTERS=10000;
const closingMark=character=>/[」』）】〉》〗〙〛”’"')\]]/u.test(character||'');

export function splitReadingText(text,maxChars=DEFAULT_PAGE_CHARACTERS){
 const source=String(text);
 if(source==='')return [''];
 const budget=typeof maxChars==='number'&&Number.isFinite(maxChars)&&maxChars>=1
  ?Math.min(MAX_PAGE_CHARACTERS,Math.floor(maxChars)):DEFAULT_PAGE_CHARACTERS;
 const characters=Array.from(source),pages=[];
 let start=0;
 while(start<characters.length){
  const limit=Math.min(characters.length,start+budget);
  if(limit===characters.length){pages.push(characters.slice(start).join(''));break;}
  let boundary=0;
  for(let index=start;index<limit;index++){
   const current=characters[index],next=characters[index+1];
   const newline=current==='\n'||current==='\r'&&next!=='\n';
   const sentence=/[。！？!?]/u.test(current)||current==='.'&&(!next||/\s/u.test(next)||closingMark(next));
   if(!newline&&!sentence)continue;
   let end=index+1;
   // Keep a sentence's closing quote and following spacing on the same page
   // when possible. Do not trim it: joining pages must recover the exact text.
   while(end<limit&&closingMark(characters[end]))end++;
   while(end<limit&&/\s/u.test(characters[end]))end++;
   boundary=Math.max(boundary,end);
  }
  const end=boundary>start?boundary:limit;
  pages.push(characters.slice(start,end).join(''));
  start=end;
 }
 return pages;
}
