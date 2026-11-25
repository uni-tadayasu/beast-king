#!/usr/bin/env node
/** Set canonical URLs for the exact deployment origin; zero dependencies. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const argument = process.argv[2];
if (!argument || process.argv.length < 3 || process.argv.length > 4) {
  console.error('Usage: node scripts/configure-seo.mjs https://example.com/base-path/ [output-directory]');
  process.exit(1);
}
let base;
try { base = new URL(argument); } catch {
  console.error('公開先を絶対URLで指定してください。');
  process.exit(1);
}
if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
  console.error('公開先には、認証情報・クエリ・フラグメントを含まないHTTP(S)のURLを指定してください。');
  process.exit(1);
}
if (!base.pathname.endsWith('/')) base.pathname += '/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[3] ? resolve(process.argv[3]) : root;
const imageUrl = new URL('assets/social-ogp.jpg?v=20261125-36', base).href;
const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const pageDefinitions = [
  {filename:'index.html',relative:'',index:true,required:true},
  {filename:'about.html',relative:'about.html',index:true,required:true},
  {filename:'rebuild/index.html',relative:'rebuild/',index:false},
  {filename:'rebuild/about.html',relative:'rebuild/about.html',index:false},
  {filename:'404.html',relative:'404.html',index:false,canonical:false},
];
const pages = (await Promise.all(pageDefinitions.map(async page => {
  try{return {...page,html:await readFile(resolve(dist,page.filename),'utf8')};}
  catch(error){if(!page.required&&error.code==='ENOENT')return null;throw error;}
}))).filter(Boolean);

// Record prior canonical bases before rewriting, so repeated runs can move safely
// between a domain root and GitHub Pages' repository subpath.
const oldBases = new Set();
for (const page of pages) {
  const tag = page.html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0];
  const href = tag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (href) {
    try {
      const old=new URL(href.replaceAll('&amp;', '&'));old.hash='';old.search='';
      oldBases.add(page.relative&&old.href.endsWith(page.relative)?old.href.slice(0,-page.relative.length):new URL('./',old).href);
    } catch { /* The new canonical below repairs malformed values. */ }
  }
}
const oldBaseList = [...oldBases].sort((a, b) => b.length - a.length);
function remapUrl(value) {
  if (typeof value !== 'string') return value;
  if (/^https?:\/\/.+\/assets\/social-ogp\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(value)) return imageUrl;
  for (const oldBase of oldBaseList) {
    if (value === oldBase.slice(0, -1)) return base.href;
    if (value.startsWith(oldBase)) return new URL(value.slice(oldBase.length), base).href;
  }
  return value;
}
function remapStructured(value) {
  if (Array.isArray(value)) return value.map(remapStructured);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remapStructured(child)]));
  return remapUrl(value);
}
function setMeta(html, attribute, key, content) {
  const tag = `<meta ${attribute}="${key}" content="${escapeAttribute(content)}">`;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapedKey}["'])[^>]*>`, 'gi');
  let found=false;
  const result=html.replace(pattern,()=>{if(found)return '';found=true;return tag;});
  return found ? result : html.replace(/<\/head>/i, `${tag}\n</head>`);
}
for (const page of pages) {
  const pageUrl = new URL(page.relative, base).href;
  const canonical = `<link rel="canonical" href="${escapeAttribute(pageUrl)}">`;
  let html = page.html;
  const canonicalPattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi;
  let foundCanonical=false;
  html=html.replace(canonicalPattern,()=>{if(page.canonical===false||foundCanonical)return '';foundCanonical=true;return canonical;});
  if(page.canonical!==false&&!foundCanonical)html=html.replace(/<\/head>/i,`${canonical}\n</head>`);
  for (const [attribute, key, value] of [
    ['name', 'robots', page.index ? 'index,follow,max-image-preview:large' : 'noindex,follow'],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', imageUrl],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:type', 'image/jpeg'],
    ['name', 'twitter:image', imageUrl],
  ]) html = setMeta(html, attribute, key, value);
  html = html.replace(/(<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (full, start, json, end) => {
    let data;
    try { data = JSON.parse(json); } catch (error) { throw new Error(`${page.filename}: JSON-LDが不正です。${error.message}`); }
    return start + JSON.stringify(remapStructured(data)).replaceAll('<', '\\u003c') + end;
  });
  page.output = html;
}
// Validate all inputs and JSON-LD before writing any output file.
for (const page of pages) await writeFile(resolve(dist, page.filename), page.output);
// Saved-game compatibility pages stay usable but are deliberately outside the
// search index. Keep crawling allowed so their HTML noindex can be read.
const urls = pages.filter(page=>page.index).map(page=>new URL(page.relative, base).href);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(resolve(dist, 'sitemap.xml'), sitemap);
await writeFile(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', base).href}\n`);
console.log(`SEO configured: ${base.href} (${pages.length} pages, social-ogp.jpg)`);
