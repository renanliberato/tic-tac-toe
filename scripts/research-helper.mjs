#!/usr/bin/env node
/* Trusted research boundary. It deliberately exposes JSON-lines commands only. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';

const tracking = /^(utm_[^=]+|gclid|fbclid|mc_[^=]+|ref|source)$/i;
export function canonicalUrl(input) {
  const u = new URL(input);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port || !u.hostname || net.isIP(u.hostname)) throw new Error('URL is not a public default-port HTTP(S) hostname URL');
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (tracking.test(key)) u.searchParams.delete(key);
  return u.toString();
}
function privateAddress(address) {
  if (net.isIP(address) === 4) return /^(0|10|127|169\.254|172\.(1[6-9]|2[0-9]|3[01])|192\.168|22[4-9]|23[0-9]|24[0-9]|25[0-5])\./.test(address);
  const a = address.toLowerCase(); return a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb');
}
export async function assertPublicUrl(input) {
  const value = canonicalUrl(input); const host = new URL(value).hostname;
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some(x => privateAddress(x.address))) throw new Error('URL DNS does not resolve exclusively to globally routable addresses');
  return value;
}
export function validateReport(file, expectedPath, ledgerFile) {
  const text = fs.readFileSync(file, 'utf8');
  const headings = ['## Sources consulted','## Synthesis','## Recommendations','## Risks and limitations','## Repository applicability'];
  if (text.includes('RESEARCH INCOMPLETE') || headings.some(h => !text.includes(h))) throw new Error('report does not have the successful research schema');
  const section = text.slice(text.indexOf(headings[0]), text.indexOf(headings[1]));
  const cited = [...section.matchAll(/^[-*]\s+(.+)$/gm)].map(x => x[1]);
  const urls = cited.map(line => (line.match(/https?:\/\/[^\s)>]+/) || [])[0]).filter(Boolean).map(canonicalUrl);
  if (new Set(urls).size < 10 || urls.length !== new Set(urls).size) throw new Error('report requires ten unique cited URLs');
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  const direct = new Set(ledger.filter(x => x.opened && x.route === 'Google result').map(x => x.url));
  if (urls.filter(u => direct.has(u)).length < 10 || urls.some(u => !ledger.some(x => x.opened && x.url === u))) throw new Error('citations do not match qualifying evidence ledger');
  return urls.length;
}
class BrowserBoundary {
  constructor(opts) { this.opts=opts; this.searches=0; this.opens=0; this.handles=new Map(); this.pages=new Map(); }
  async start() {
    let puppeteer; try { puppeteer = await import('puppeteer'); } catch { throw new Error('Puppeteer module is unavailable'); }
    this.browser = await puppeteer.default.launch({ headless:true, userDataDir:this.opts.profile, args:['--no-first-run','--disable-downloads'] });
    this.page = await this.browser.newPage(); await this.page.setDefaultNavigationTimeout(this.opts.timeout * 1000);
    await this.page._client().send('Browser.setDownloadBehavior',{behavior:'deny'}).catch(()=>{});
  }
  async close(){ await this.browser?.close(); }
  async search(query) {
    if (++this.searches > this.opts.maxSearches) throw new Error('search quota exceeded');
    await this.page.goto('https://www.google.com/search?q='+encodeURIComponent(query), {waitUntil:'domcontentloaded'});
    const rows=await this.page.$$eval('a[href]', as=>as.map(a=>({title:(a.textContent||'').trim(),url:a.href})).filter(x=>x.title&&/^https?:/.test(x.url)).slice(0,20));
    return rows.map((x,i)=>{const h='g'+this.searches+'-'+i;this.handles.set(h,{...x,route:'Google result'});return {handle:h,title:x.title,url:x.url};});
  }
  async open(handle) {
    const item=this.handles.get(handle); if(!item) throw new Error('unknown opaque result handle'); if (++this.opens > this.opts.maxOpens) throw new Error('content-page-open quota exceeded');
    const url=await assertPublicUrl(item.url); await this.page.goto(url,{waitUntil:'domcontentloaded'}); const final=await assertPublicUrl(this.page.url());
    const data=await this.page.evaluate(()=>({title:document.title,text:(document.body?.innerText||'').slice(0,1000),links:[...document.links].slice(0,100).map(a=>({title:(a.textContent||'').trim(),url:a.href}))}));
    const record={url:canonicalUrl(final),title:data.title.slice(0,500),route:item.route,opened:true}; this.pages.set(handle,record);
    const links=[]; if(item.route==='Google result') for (const [i,l] of data.links.entries()) try { const h='l'+this.opens+'-'+i; this.handles.set(h,{...l,route:'one-hop subpage'}); links.push({handle:h,title:l.title,url:l.url}); } catch {}
    return {...record, excerpt:data.text.slice(0,1000),links};
  }
}
async function cli() {
 const [cmd,...args]=process.argv.slice(2);
 if(cmd==='validate') { process.stdout.write(String(validateReport(args[0],args[1],args[2]))+'\n'); return; }
 if(cmd==='preflight') { const b=new BrowserBoundary({profile:args[0],timeout:Number(args[1]),maxSearches:1,maxOpens:1}); await b.start(); await b.close(); process.stdout.write('ok\n'); return; }
 throw new Error('unsupported trusted helper command');
}
if (import.meta.url === `file://${process.argv[1]}`) cli().catch(e=>{console.error(`research-helper: ${e.message}`);process.exit(1)});
