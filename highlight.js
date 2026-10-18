// Text highlighting that survives re-rendering.
// A highlight is {s, e, c}: start/end character offsets inside one container's text, plus a colour name.
// The container's DOM is rebuilt whenever the student switches part, so highlights live in a list and are re-applied.

const SKIP = 'input,select,textarea,button,script,style';

function textNodes(root) {
  const out = [];
  const w = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */, {
    acceptNode: n => (n.parentElement && n.parentElement.closest(SKIP) ? 2 /* REJECT */ : 1 /* ACCEPT */),
  });
  let n;
  while ((n = w.nextNode())) out.push(n);
  return out;
}

function pointOffset(root, container, offset) {
  const doc = root.ownerDocument;
  let pos = 0;
  for (const t of textNodes(root)) {
    if (t === container) return pos + offset;
    const r = doc.createRange();
    r.selectNodeContents(t);
    if (r.comparePoint(container, offset) > 0) pos += t.length; // the point lies after this node
    else return pos;
  }
  return pos;
}

/** Character offsets of a DOM Range inside root. */
export function offsetsOf(root, range) {
  return { s: pointOffset(root, range.startContainer, range.startOffset), e: pointOffset(root, range.endContainer, range.endOffset) };
}

/** Remove every highlight mark from root, leaving the text untouched. */
export function clearMarks(root) {
  root.querySelectorAll('mark.hl').forEach(m => m.replaceWith(...m.childNodes));
  root.normalize();
}

/** Paint a list of highlights onto root (clears first). */
export function paint(root, list) {
  clearMarks(root);
  const doc = root.ownerDocument;
  for (const h of list) {
    const jobs = [];
    let pos = 0;
    for (const t of textNodes(root)) {
      const len = t.length, a = Math.max(h.s, pos) - pos, b = Math.min(h.e, pos + len) - pos;
      if (b > a) jobs.push([t, a, b]);
      pos += len;
    }
    for (const [t, a, b] of jobs) {
      const r = doc.createRange();
      r.setStart(t, a); r.setEnd(t, b);
      const m = doc.createElement('mark');
      m.className = 'hl hl-' + h.c;
      r.surroundContents(m);
    }
  }
}

// ---- pure list helpers ----
/** Cut [s,e) out of every highlight in the list (used by "remove" and before recolouring). */
export function cut(list, s, e) {
  const out = [];
  for (const h of list) {
    if (h.e <= s || h.s >= e) { out.push(h); continue; }
    if (h.s < s) out.push({ s: h.s, e: s, c: h.c });
    if (h.e > e) out.push({ s: e, e: h.e, c: h.c });
  }
  return out;
}
export function add(list, s, e, c) {
  if (e <= s) return list;
  return cut(list, s, e).concat([{ s, e, c }]).sort((a, b) => a.s - b.s);
}
