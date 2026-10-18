// Converts the standalone "Simulator" HTML files into data/tests.json (+ audio/ and img/ files).
//   node tools/import-simulators.mjs <file.html|dir|zip-extracted-dir> ...
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { JSDOM } from 'jsdom';
import { prepare, grade } from '../js/logic.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const inputs = process.argv.slice(2);
if (!inputs.length) { console.error('usage: node tools/import-simulators.mjs <files or folders>'); process.exit(1); }

const files = inputs.flatMap(p => fs.statSync(p).isDirectory()
  ? fs.readdirSync(p).filter(f => f.endsWith('.html')).map(f => path.join(p, f)) : [p]);

// ---------- helpers ----------
function extractVar(src, name) {
  const m = new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*`).exec(src);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  const open = src[i], close = open === '[' ? ']' : '}';
  let depth = 0, str = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return vm.runInNewContext('(' + src.slice(i, j + 1) + ')');
  }
  throw new Error('unterminated ' + name);
}
const uuid = slug => { const h = crypto.createHash('sha1').update('ewu:' + slug).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const clean = s => s.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
const tidy = s => clean(s).replace(/\]\]\s+([.,;:!?])/g, ']]$1');

/** DOM node -> light markup (**bold**, [[gap answers]]) */
function conv(node, gaps) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) out += n.textContent;
    else if (n.nodeType === 1) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'input' && n.classList.contains('gap')) out += `[[${gaps(Number(n.dataset.q))}]]`;
      else if (n.classList.contains('gap-num')) continue;
      else if (tag === 'b' || tag === 'strong') { const t = conv(n, gaps).trim(); out += t ? `**${t}**` : ''; }
      else if (tag === 'br') out += '\n';
      else out += conv(n, gaps);
    }
  }
  return out;
}
const txt = (el, gaps) => el ? tidy(conv(el, gaps)) : '';
const paras = (el, gaps) => [...el.querySelectorAll(':scope > p')].map(p => txt(p, gaps)).filter(Boolean).join('\n\n');
const label = s => s.replace(/\s+/g, ' ').trim();

/** Splits huge base64 payloads out of the file (regex on 14 MB blobs overflows the stack). */
function stripBlobs(raw) {
  const blobs = [];
  let out = '', i = 0, m;
  const re = /data:([a-z]+\/[a-z0-9.+-]+);base64,/g;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    let j = start;
    while (j < raw.length) {
      const c = raw.charCodeAt(j);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61) j++; else break;
    }
    out += raw.slice(i, m.index) + `data:blob;${j - start}`;
    blobs.push({ mime: m[1], b64: raw.slice(start, j) });
    i = j; re.lastIndex = j;
  }
  return { src: out + raw.slice(i), blobs };
}

const outTests = [];
const report = [];
fs.mkdirSync(path.join(ROOT, 'audio'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'img'), { recursive: true });

for (const file of files.sort()) {
  const raw = fs.readFileSync(file, 'utf8');
  const base = path.basename(file);
  const { src, blobs } = stripBlobs(raw);
  const isListening = /Listening/i.test(base);
  const doc = new JSDOM(src).window.document;
  const A = extractVar(src, 'ANSWERS');
  const parts = [];
  let test;

  if (!isListening) {
    // ───────── READING (Multilevel, 5 parts / 35 questions) ─────────
    const gaps = n => String(A[n]);
    const view = n => doc.querySelector(`.part-view[data-part="${n}"]`);
    const title = el => label(el.querySelector('.passage-title')?.textContent || '');
    const N = (base.match(/^(\d+)_/) || [])[1] || String(report.length + 1).padStart(2, '0');
    const glossary = (() => { try { return extractVar(src, 'GLOSSARY'); } catch { return undefined; } })();

    // P1 gap-fill passage
    { const v = view(1);
      parts.push({ title: title(v), instruction: txt(v.querySelector('.task-instructions'), gaps),
        text: v.querySelector('.passage-body') ? paras(v.querySelector('.passage-body'), gaps) : '', blocks: [] }); }
    // P2 matching to a list of situations / games / ...
    { const v = view(2);
      const items = [...v.querySelectorAll('.situation-item, .game-card, .option-item')];
      const options = items.map(el => { const t = label(txt(el, gaps)); const m = t.match(/^\**([A-J])\**\s*[).:]\s*\**\s*(.*)$/s); return m ? { label: m[1], text: m[2].replace(/\*\*/g, '').trim() } : null; }).filter(Boolean);
      const qs = (extractVar(src, 'p2Jobs') || extractVar(src, 'p2Statements')).map(([n, t]) => ({ type: 'match', text: t, answer: A[n] }));
      parts.push({ title: title(v), options_title: label(v.querySelector('.pane-label')?.textContent || ''), options,
        blocks: [{ instruction: txt(v.querySelector('#p2-questions .task-instructions'), gaps), questions: qs }] }); }
    // P3 headings
    { const v = view(3);
      const text = [...v.querySelectorAll('.para-block')].map(pb => `## ${label(pb.querySelector('.para-num').textContent)}\n\n${txt(pb.querySelector('p'), gaps)}`).join('\n\n');
      const heads = extractVar(src, 'p3Headings').map(([l, t]) => ({ label: l, text: t }));
      const sts = extractVar(src, 'p3Statements');
      parts.push({ title: title(v), text, blocks: [{
        instruction: `Choose the correct heading for each paragraph from the list below. There are more headings than paragraphs: ${heads.length - sts.length} are not used.`,
        options: heads, questions: sts.map(([n, t]) => ({ type: 'match', text: t, answer: A[n] })) }] }); }
    // P4 passage + MCQ + TFNG
    { const v = view(4);
      const ins = txt(v.querySelector('#p4-questions .task-instructions'), gaps);
      const k = ins.search(/Questions? 25/);
      const mc = extractVar(src, 'p4MC').map(([n, t, o]) => ({ type: 'mcq', text: t, options: o.map(([l, x]) => ({ label: l, text: x })), answer: A[n] }));
      const tf = extractVar(src, 'p4TFNG').map(([n, t]) => ({ type: 'tfng', text: t, answer: A[n] }));
      parts.push({ title: title(v), text: paras(v.querySelector('.passage-body'), gaps), blocks: [
        { instruction: k > 0 ? ins.slice(0, k).trim() : 'Choose the correct letter, A, B, C or D.', questions: mc },
        { instruction: k > 0 ? ins.slice(k).trim() : 'Do the statements agree with the passage? Choose True, False or Not Given.', questions: tf }] }); }
    // P5 passage + summary gaps + MCQ
    { const v = view(5);
      const ins = txt(v.querySelector('#p5-questions .task-instructions'), gaps);
      const k = ins.search(/Questions? 34/);
      const sum = v.querySelector('.summary-block');
      const mc = extractVar(src, 'p5MC').map(([n, t, o]) => ({ type: 'mcq', text: t, options: o.map(([l, x]) => ({ label: l, text: x })), answer: A[n] }));
      parts.push({ title: title(v), text: paras(v.querySelector('.passage-body'), gaps), blocks: [
        { instruction: k > 0 ? ins.slice(0, k).trim() : ins, body: sum ? paras(sum, gaps) : '', questions: [] },
        { instruction: k > 0 ? ins.slice(k).trim() : 'Choose the correct letter, A, B, C or D.', questions: mc }] }); }

    const slug = `multilevel-reading-${N}`;
    test = { id: uuid(slug), section: 'reading', format: 'multilevel', title: `Multilevel Reading ${N}`, duration_min: 60, play_once: false, published: true,
      data: { parts, ...(glossary ? { glossary: Object.fromEntries(glossary.map(g => [g.word.toLowerCase(), g.uz])) } : {}) } };
  } else {
    // ───────── LISTENING (Multilevel, 6 parts / 35 questions, one audio file) ─────────
    const gaps = n => (Array.isArray(A[n]) ? A[n] : [A[n]]).map(x => { if (String(x).includes('/')) throw new Error('slash in answer ' + x); return x; }).join('/');
    const view = n => doc.querySelector(`.part-view[data-part="${n}"]`);
    const title = el => label(el.querySelector('.passage-title')?.textContent || '');
    const ins = el => txt(el.querySelector('.task-instructions'), gaps);
    const first = n => (Array.isArray(A[n]) ? A[n][0] : A[n]);
    const TL = extractVar(src, 'TIMELINE');
    const timing = i => { const t = TL[i]; return { start: t.start, readStart: t.readStart, readEnd: t.readEnd, end: t.end, checkEnd: t.checkEnd }; };
    const notes = card => [...card.children].map(el => {
      const t = el.tagName.toLowerCase();
      if (t === 'h3') return `# ${txt(el, gaps)}`;
      if (t === 'h4') return `## ${txt(el, gaps)}`;
      return txt(el, gaps).replace(/^•\s*/, '• ');
    }).filter(Boolean).reduce((acc, t, i, arr) => acc + (i ? (t.startsWith('•') && arr[i - 1].startsWith('•') ? '\n' : '\n\n') : '') + t, '');
    const mcq = (n, stem, o) => ({ type: 'mcq', text: stem, options: o.map(([l, x]) => ({ label: l, text: x })), answer: first(n) });
    const slug = (() => { const m = base.match(/N(\d+)/i); return m ? `multilevel-listening-n${m[1]}` : 'multilevel-listening-base'; })();
    const num = (base.match(/N(\d+)/i) || [])[1];

    { const v = view(1); parts.push({ title: title(v), instruction: ins(v), timing: timing(0),
        blocks: [{ instruction: '', questions: extractVar(src, 'p1').map(([n, o]) => mcq(n, '', o)) }] }); }
    { const v = view(2); parts.push({ title: title(v), instruction: ins(v), timing: timing(1), text: notes(v.querySelector('.notes-card')), blocks: [] }); }
    { const v = view(3);
      const ref = v.querySelector('.options-ref');
      const options = [...ref.querySelectorAll('.opt-line')].map(l => ({ label: label(l.querySelector('b').textContent), text: label(l.textContent).slice(label(l.querySelector('b').textContent).length).trim() }));
      const R = extractVar(src, 'PART_RANGES')[3];
      const qs = []; for (let n = R[0]; n <= R[1]; n++) qs.push({ type: 'match', text: `Speaker ${n - R[0] + 1}`, answer: first(n) });
      parts.push({ title: title(v), instruction: ins(v), timing: timing(2), options_title: label(ref.querySelector('.ref-title')?.textContent || ''), options, blocks: [{ instruction: '', questions: qs }] }); }
    { const v = view(4);
      const line = src.match(/getElementById\('p4-questions'\)\.innerHTML = (\[\[[\s\S]*?\]\])\s*\.map\(function\(x\)\{ return selectCard\(x\[0\], x\[1\], (\[[^\]]*\])\)/);
      if (!line) throw new Error('p4 pattern not found in ' + base);
      const names = vm.runInNewContext(line[1]), letters = vm.runInNewContext(line[2]);
      const imgs = blobs.filter(b => b.mime.startsWith('image/') && b.b64.length > 2000).sort((x, y) => y.b64.length - x.b64.length);
      let image = '';
      if (imgs.length) { const ext = imgs[0].mime.includes('jpeg') ? 'jpg' : imgs[0].mime.includes('webp') ? 'webp' : 'png'; image = `img/${slug}-map.${ext}`; fs.writeFileSync(path.join(ROOT, image), Buffer.from(imgs[0].b64, 'base64')); }
      parts.push({ title: title(v), instruction: ins(v), timing: timing(3), image, options: letters.map(l => ({ label: l, text: '' })),
        blocks: [{ instruction: '', questions: names.map(([n, t]) => ({ type: 'match', text: t, answer: first(n) })) }] }); }
    { const v = view(5);
      parts.push({ title: title(v), instruction: ins(v), timing: timing(4),
        blocks: extractVar(src, 'p5').map(([head, desc, qs]) => ({ instruction: `**${head}**: ${desc}`, questions: qs.map(([n, stem, o]) => mcq(n, stem, o)) })) }); }
    { const v = view(6); parts.push({ title: title(v), instruction: ins(v), timing: timing(5), text: notes(v.querySelector('.notes-card')), blocks: [] }); }

    // audio
    const au = blobs.filter(b => b.mime.startsWith('audio/')).sort((x, y) => y.b64.length - x.b64.length)[0];
    let audio_url = '';
    if (au) { const ext = /mpeg|mp3/.test(au.mime) ? 'mp3' : au.mime.includes('wav') ? 'wav' : au.mime.includes('ogg') ? 'ogg' : /mp4|aac/.test(au.mime) ? 'm4a' : 'bin';
      audio_url = `audio/${slug}.${ext}`; fs.writeFileSync(path.join(ROOT, audio_url), Buffer.from(au.b64, 'base64')); }
    else console.warn('!! no embedded audio found in', base);
    const dur = Math.ceil(TL[TL.length - 1].checkEnd / 60);
    test = { id: uuid(slug), section: 'listening', format: 'multilevel', title: num ? `Multilevel Listening N${num}` : 'Multilevel Listening (Mock)', duration_min: dur, play_once: true, published: true,
      data: { audio_url, parts } };
  }

  // ---------- verify: answering with the original answer key must score 35/35 ----------
  const { flat } = prepare(test);
  const key = {};
  for (const q of flat) key[q.n] = q.type === 'fill' ? q.answer.split('/')[0] : q.answer;
  const g = grade(test, key);
  const bad = g.details.filter(d => !d.ok).map(d => d.n);
  const keyCount = Object.keys(A).length;
  const warns = [];
  if (flat.length !== keyCount) warns.push(`questions ${flat.length} != answer keys ${keyCount}`);
  if (bad.length) warns.push('self-grade failed for Q' + bad.join(','));
  // each original answer must match too (all accepted spellings)
  for (const q of flat) {
    const accepted = Array.isArray(A[q.n]) ? A[q.n] : [A[q.n]];
    if (q.type !== 'fill' && !accepted.some(a => String(a).toLowerCase() === String(q.answer).toLowerCase())) warns.push(`Q${q.n} answer mismatch`);
    if (q.type === 'match' && !q.choices?.some(c => c.label === q.answer)) warns.push(`Q${q.n} answer not among options`);
    if (q.type === 'mcq' && !q.options.some(c => c.label === q.answer)) warns.push(`Q${q.n} answer not among options`);
  }
  outTests.push(test);
  report.push({ file: base.slice(0, 44), id: test.title, questions: flat.length, parts: test.data.parts.length, warns });
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
outTests.sort((a, b) => (a.section + a.title).localeCompare(b.section + b.title, undefined, { numeric: true }));
fs.writeFileSync(path.join(ROOT, 'data/tests.json'), JSON.stringify({ version: 1, tests: outTests }));
console.table(report.map(r => ({ ...r, warns: r.warns.join('; ') || 'ok' })));
console.log(`wrote ${outTests.length} tests`);
