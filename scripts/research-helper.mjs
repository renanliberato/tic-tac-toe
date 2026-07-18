#!/usr/bin/env node
/* Trusted research boundary. It deliberately exposes JSON-lines commands only. */
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns/promises';
import readline from 'node:readline';

const tracking = /^(utm_[^=]+|gclid|fbclid|mc_[^=]+|ref|source)$/i;
const routes = new Set(['Google result', 'one-hop subpage']);

export function canonicalUrl(input) {
  const u = new URL(input);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port || !u.hostname || net.isIP(u.hostname)) {
    throw new Error('URL is not a public default-port HTTP(S) hostname URL');
  }
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (tracking.test(key)) u.searchParams.delete(key);
  return u.toString();
}

function privateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) || a >= 224;
  }
  const a = address.toLowerCase();
  if (a === '::' || a === '::1' || a.startsWith('fc') || a.startsWith('fd') || /^fe[89ab]/.test(a)) return true;
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && privateAddress(mapped[1]));
}

export async function assertPublicUrl(input) {
  const value = canonicalUrl(input);
  const host = new URL(value).hostname;
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
    throw new Error('URL DNS does not resolve exclusively to globally routable addresses');
  }
  return value;
}

function sourceEntries(text) {
  const headings = ['## Sources consulted', '## Synthesis', '## Recommendations', '## Risks and limitations', '## Repository applicability'];
  if (text.includes('RESEARCH INCOMPLETE') || headings.some(heading => !text.includes(heading))) {
    throw new Error('report does not have the successful research schema');
  }
  const section = text.slice(text.indexOf(headings[0]) + headings[0].length, text.indexOf(headings[1]));
  const lines = section.split(/\r?\n/).filter(line => line.trim());
  const entry = /^[-*]\s+Title:\s*(?<title>[^|\r\n]*\S)\s+\|\s+URL:\s*(?<url>https?:\/\/[^\s|)]+)\s+\|\s+Route:\s*(?<route>Google result|one-hop subpage)\s+\|\s+Evidence:\s*(?<evidence>[^\r\n]*\S)\s*$/;
  if (!lines.length || lines.some(line => !entry.test(line))) {
    throw new Error('each source must include Title, URL, Route, and Evidence fields');
  }
  return lines.map(line => {
    const fields = entry.exec(line).groups;
    return { title: fields.title.trim(), url: canonicalUrl(fields.url), route: fields.route, evidence: fields.evidence.trim() };
  });
}

export function validateReport(file, expectedPath, ledgerFile) {
  const entries = sourceEntries(fs.readFileSync(file, 'utf8'));
  const uniqueUrls = new Set(entries.map(entry => entry.url));
  if (uniqueUrls.size < 10 || uniqueUrls.size !== entries.length) throw new Error('report requires ten unique cited URLs');
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  if (!Array.isArray(ledger)) throw new Error('evidence ledger is invalid');
  for (const entry of entries) {
    const record = ledger.find(item => item && item.opened === true && item.url === entry.url && item.route === entry.route && item.title === entry.title);
    if (!record || !routes.has(record.route)) throw new Error('citations do not match qualifying evidence ledger');
  }
  if (entries.filter(entry => entry.route === 'Google result').length < 10) {
    throw new Error('report requires ten direct Google-result sources');
  }
  return entries.length;
}

export class BrowserBoundary {
  constructor(opts) {
    this.opts = opts;
    this.validateUrl = opts.validateUrl || assertPublicUrl;
    this.searches = 0;
    this.opens = 0;
    this.handles = new Map();
    this.pages = new Map();
    this.blockedRequestError = null;
  }
  async installRequestGuard(page) {
    await page.setRequestInterception(true);
    page.on('request', request => this.guardRequest(request));
  }
  async guardRequest(request) {
    try {
      // Interception happens before Chromium sends this request. This covers a
      // redirect's next request as well as subresources, preventing a public
      // result URL from being used as an SSRF redirect trampoline.
      await this.validateUrl(request.url());
      if (!request.isInterceptResolutionHandled?.()) await request.continue();
    } catch (error) {
      this.blockedRequestError ||= error;
      if (!request.isInterceptResolutionHandled?.()) await request.abort('blockedbyclient');
    }
  }
  async start() {
    let puppeteer;
    try { puppeteer = await import('puppeteer'); } catch { throw new Error('Puppeteer module is unavailable'); }
    this.browser = await puppeteer.default.launch({
      headless: true,
      userDataDir: this.opts.profile,
      args: ['--no-first-run', '--disable-downloads']
    });
    this.page = await this.browser.newPage();
    await this.page.setDefaultNavigationTimeout(this.opts.timeout * 1000);
    await this.page._client().send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    await this.installRequestGuard(this.page);
  }
  async close() { await this.browser?.close(); }
  async goto(url) {
    this.blockedRequestError = null;
    try {
      return await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      if (this.blockedRequestError) throw this.blockedRequestError;
      throw error;
    }
  }
  async search(query) {
    if (++this.searches > this.opts.maxSearches) throw new Error('search quota exceeded');
    await this.goto('https://www.google.com/search?q=' + encodeURIComponent(query));
    const search = await this.page.$$eval('html', roots => {
      const doc = roots[0].ownerDocument;
      const text = (doc.body?.innerText || doc.body?.textContent || '').toLowerCase();
      const challenge = /^\/sorry(?:\/|$)/.test(doc.location.pathname) ||
        text.includes('our systems have detected unusual traffic') ||
        text.includes("to continue, please verify that you're not a robot") ||
        text.includes('why did this happen?');
      const anchors = [...doc.querySelectorAll('#search a[href], #rso a[href]')];
      const rows = anchors.map(a => {
        const heading = a.querySelector('h3');
        return { title: (heading?.textContent || '').trim(), url: a.href };
      }).filter(x => x.title && /^https?:/.test(x.url));
      return { challenge, rows: rows.slice(0, 20) };
    });
    if (search.challenge) throw new Error('Google search returned a challenge page');
    if (search.rows.length < 10) throw new Error('Google search returned fewer than ten organic results');
    return search.rows.map((x, i) => {
      const h = 'g' + this.searches + '-' + i;
      this.handles.set(h, { ...x, route: 'Google result' });
      return { handle: h, title: x.title, url: x.url };
    });
  }
  async open(handle) {
    const item = this.handles.get(handle);
    if (!item) throw new Error('unknown opaque result handle');
    if (++this.opens > this.opts.maxOpens) throw new Error('content-page-open quota exceeded');
    const url = await this.validateUrl(item.url);
    await this.goto(url);
    const final = await this.validateUrl(this.page.url());
    const data = await this.page.evaluate(() => ({
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 1000),
      links: [...document.links].slice(0, 100).map(a => ({ title: (a.textContent || '').trim(), url: a.href }))
    }));
    const record = { url: canonicalUrl(final), title: data.title.slice(0, 500), route: item.route, opened: true };
    this.pages.set(handle, record);
    const links = [];
    if (item.route === 'Google result') for (const [i, link] of data.links.entries()) {
      const h = 'l' + this.opens + '-' + i;
      this.handles.set(h, { ...link, route: 'one-hop subpage' });
      links.push({ handle: h, title: link.title, url: link.url });
    }
    return { ...record, excerpt: data.text.slice(0, 1000), links };
  }
}

function safePath(value) { return typeof value === 'string' && value.length > 0; }
function writeLedger(file, boundary) { fs.writeFileSync(file, JSON.stringify([...boundary.pages.values()])); }

async function serve(args) {
  const [profile, timeout, maxSearches, maxOpens, ledger, report, response] = args;
  if (![profile, ledger, report, response].every(safePath)) throw new Error('serve requires trusted staging paths');
  const boundary = new BrowserBoundary({ profile, timeout: Number(timeout), maxSearches: Number(maxSearches), maxOpens: Number(maxOpens) });
  await boundary.start();
  const reply = value => process.stdout.write(JSON.stringify(value) + '\n');
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of input) {
      try {
        const action = JSON.parse(line);
        let data;
        switch (action.action) {
          case 'list': data = { report, response, opened: [...boundary.pages.values()] }; break;
          case 'read':
            if (action.path !== report && action.path !== response) throw new Error('read path is not a staging artifact');
            data = fs.existsSync(action.path) ? fs.readFileSync(action.path, 'utf8') : '';
            break;
          case 'search': data = await boundary.search(action.query); break;
          case 'open-result':
          case 'open-link':
            data = await boundary.open(action.handle);
            writeLedger(ledger, boundary);
            break;
          case 'write-report':
            if (action.path !== report) throw new Error('report may only be written to its staging path');
            fs.writeFileSync(report, action.content, { encoding: 'utf8', mode: 0o600 }); data = { written: report }; break;
          case 'write-response':
            if (action.path !== response) throw new Error('response may only be written to its staging path');
            fs.writeFileSync(response, action.content, { encoding: 'utf8', mode: 0o600 }); data = { written: response }; break;
          default: throw new Error('unsupported research action');
        }
        reply({ ok: true, data });
      } catch (error) { reply({ ok: false, error: error.message }); }
    }
  } finally { await boundary.close(); }
}

async function cli() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'validate') { process.stdout.write(String(validateReport(args[0], args[1], args[2])) + '\n'); return; }
  if (cmd === 'preflight') { const b = new BrowserBoundary({ profile: args[0], timeout: Number(args[1]), maxSearches: 1, maxOpens: 1 }); await b.start(); await b.close(); process.stdout.write('ok\n'); return; }
  if (cmd === 'serve') { await serve(args); return; }
  throw new Error('unsupported trusted helper command');
}
if (import.meta.url === `file://${process.argv[1]}`) cli().catch(error => { console.error(`research-helper: ${error.message}`); process.exit(1); });
