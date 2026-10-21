/**
 * Word stores equations as Office Math (OMML) XML, which mammoth skips
 * entirely, so a formula in an uploaded document simply vanished. This turns
 * one OMML tree into LaTeX, which the frontend renders with KaTeX.
 *
 * Covers the structures Word's equation editor produces (fractions, scripts,
 * roots, n-ary operators, delimiters, functions, accents, matrices, equation
 * arrays). Anything unknown is converted through its children, so at worst a
 * formula loses some layout, never its content.
 */

export const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const SYMBOLS: Record<string, string> = {
  '×': '\\times ', '÷': '\\div ', '±': '\\pm ', '∓': '\\mp ', '·': '\\cdot ', '⋅': '\\cdot ', '∙': '\\cdot ',
  '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ', '≡': '\\equiv ', '∝': '\\propto ', '∼': '\\sim ',
  '≪': '\\ll ', '≫': '\\gg ', '≅': '\\cong ',
  '∞': '\\infty ', '∂': '\\partial ', '∇': '\\nabla ', '∅': '\\emptyset ', '∠': '\\angle ', '°': '^{\\circ}',
  '→': '\\to ', '←': '\\leftarrow ', '↔': '\\leftrightarrow ', '⇒': '\\Rightarrow ', '⇐': '\\Leftarrow ', '⇔': '\\Leftrightarrow ',
  '∈': '\\in ', '∉': '\\notin ', '∋': '\\ni ', '⊂': '\\subset ', '⊃': '\\supset ', '⊆': '\\subseteq ', '⊇': '\\supseteq ',
  '∪': '\\cup ', '∩': '\\cap ', '∀': '\\forall ', '∃': '\\exists ', '¬': '\\neg ', '∧': '\\land ', '∨': '\\lor ',
  '⊥': '\\perp ', '∥': '\\parallel ', '…': '\\ldots ', '⋯': '\\cdots ', '⋮': '\\vdots ', '⋱': '\\ddots ',
  '√': '\\surd ', '′': "'", '″': "''", '−': '-', '∗': '*', '⊕': '\\oplus ', '⊗': '\\otimes ',
  'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ', 'ε': '\\varepsilon ', 'ϵ': '\\epsilon ', 'ζ': '\\zeta ',
  'η': '\\eta ', 'θ': '\\theta ', 'ϑ': '\\vartheta ', 'ι': '\\iota ', 'κ': '\\kappa ', 'λ': '\\lambda ', 'μ': '\\mu ',
  'ν': '\\nu ', 'ξ': '\\xi ', 'π': '\\pi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'ς': '\\varsigma ', 'τ': '\\tau ',
  'υ': '\\upsilon ', 'φ': '\\varphi ', 'ϕ': '\\phi ', 'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ',
  'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Θ': '\\Theta ', 'Λ': '\\Lambda ', 'Ξ': '\\Xi ', 'Π': '\\Pi ', 'Σ': '\\Sigma ',
  'Υ': '\\Upsilon ', 'Φ': '\\Phi ', 'Ψ': '\\Psi ', 'Ω': '\\Omega ',
  // A bar would end a GFM table cell, so it is always written as a command.
  '|': '\\vert ', '‖': '\\Vert ',
  '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '$': '\\$', '&': '\\&', '_': '\\_', '~': '\\sim ', '^': '\\hat{}',
  '\\': '\\backslash ',
};

const NARY: Record<string, string> = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
  '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge',
};

const ACCENTS: Record<string, string> = {
  '̂': '\\hat', '̃': '\\tilde', '̇': '\\dot', '̈': '\\ddot', '⃗': '\\vec', '→': '\\vec',
  '̄': '\\bar', '̅': '\\bar', '¯': '\\bar', '̌': '\\check', '̆': '\\breve', '́': '\\acute', '̀': '\\grave',
};

const DELIMITERS: Record<string, string> = {
  '': '.', '{': '\\{', '}': '\\}', '|': '\\vert', '‖': '\\Vert', '⟨': '\\langle', '〈': '\\langle', '⟩': '\\rangle', '〉': '\\rangle',
  '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil',
};

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg',
]);

const HEBREW = /[֐-׿]/;

function mathChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

function child(el: Element | undefined, name: string): Element | undefined {
  return el ? mathChildren(el).find((c) => c.namespaceURI === MATH_NS && c.localName === name) : undefined;
}

/** The m:val of a property, e.g. <m:chr m:val="∑"/> inside <m:naryPr>. */
function prop(el: Element, propsName: string, name: string): string | undefined {
  const p = child(child(el, propsName), name);
  return p ? val(p) : undefined;
}

/** A property's m:val; a flag written without one (<m:nor/>) is on. */
function val(p: Element): string | undefined {
  // An empty value is meaningful (begChr="" is "no opening bracket"), so presence is checked, not truthiness.
  return p.hasAttributeNS(MATH_NS, 'val') ? p.getAttributeNS(MATH_NS, 'val') ?? '' : undefined;
}

/** An on/off property such as <m:degHide/>: on when present, unless its value turns it off. */
function flag(el: Element, propsName: string, name: string): boolean {
  const p = child(child(el, propsName), name);
  return p !== undefined && isOn(val(p));
}

const isOn = (v: string | undefined) => v !== '0' && v !== 'off' && v !== 'false';

const group = (s: string) => `{${s.trim()}}`;

function escapeText(text: string): string {
  return Array.from(text, (ch) => SYMBOLS[ch] ?? ch).join('');
}

/** Text that is not a variable — Hebrew words, or a run marked "normal text" — keeps its letters upright. */
function textCommand(text: string): string {
  return `\\text{${text.replace(/[\\{}]/g, (c) => `\\${c === '\\' ? 'backslash ' : c}`)}}`;
}

function runText(run: Element): string {
  let text = '';
  for (const c of mathChildren(run)) if (c.localName === 't') text += c.textContent ?? '';
  return text;
}

function convertRun(run: Element): string {
  const text = runText(run);
  if (!text) return '';
  if (flag(run, 'rPr', 'nor') || HEBREW.test(text)) return textCommand(text);
  return escapeText(text);
}

function convertChildren(el: Element | undefined): string {
  if (!el) return '';
  return mathChildren(el).map(convertElement).join('');
}

function delimiter(ch: string): string {
  return DELIMITERS[ch] ?? ch;
}

function convertNary(el: Element): string {
  const chr = prop(el, 'naryPr', 'chr') ?? '∫';
  let op = NARY[chr] ?? `\\mathop{${escapeText(chr)}}`;
  if (prop(el, 'naryPr', 'limLoc') === 'undOvr' && op.startsWith('\\') && /int/.test(op)) op += '\\limits';
  const sub = flag(el, 'naryPr', 'subHide') ? '' : convertChildren(child(el, 'sub'));
  const sup = flag(el, 'naryPr', 'supHide') ? '' : convertChildren(child(el, 'sup'));
  return `${op}${sub ? `_${group(sub)}` : ''}${sup ? `^${group(sup)}` : ''}${group(convertChildren(child(el, 'e')))}`;
}

function convertDelimited(el: Element): string {
  const beg = prop(el, 'dPr', 'begChr') ?? '(';
  const end = prop(el, 'dPr', 'endChr') ?? ')';
  const sepChr = prop(el, 'dPr', 'sepChr') ?? '|';
  const sep = ` ${SYMBOLS[sepChr] ?? sepChr} `;
  const items = mathChildren(el).filter((c) => c.localName === 'e').map(convertChildren);
  return `\\left${delimiter(beg)} ${items.join(sep)} \\right${delimiter(end)}`;
}

function convertFunction(el: Element): string {
  const name = convertChildren(child(el, 'fName')).trim();
  const fn = FUNCTIONS.has(name) ? `\\${name}` : name.replace(/^([a-z]+)(?=_)/, (w) => (FUNCTIONS.has(w) ? `\\${w}` : w));
  return `${fn} ${convertChildren(child(el, 'e'))}`;
}

function convertMatrix(el: Element): string {
  const rows = mathChildren(el)
    .filter((c) => c.localName === 'mr')
    .map((row) => mathChildren(row).filter((c) => c.localName === 'e').map(convertChildren).join(' & '));
  return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
}

function convertElement(el: Element): string {
  if (el.namespaceURI !== MATH_NS) {
    // A plain Word run inside an equation is text written in the middle of it.
    if (el.namespaceURI === W_NS && el.localName === 'r') {
      const text = Array.from(el.getElementsByTagNameNS(W_NS, 't')).map((t) => t.textContent ?? '').join('');
      return text ? textCommand(text) : '';
    }
    return '';
  }
  switch (el.localName) {
    case 'r': return convertRun(el);
    case 'f': {
      const num = convertChildren(child(el, 'num'));
      const den = convertChildren(child(el, 'den'));
      const type = prop(el, 'fPr', 'type');
      if (type === 'lin') return `${group(num)}/${group(den)}`;
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}${group(num)}${group(den)}`;
      return `\\frac${group(num)}${group(den)}`;
    }
    case 'sSup': return `${group(convertChildren(child(el, 'e')))}^${group(convertChildren(child(el, 'sup')))}`;
    case 'sSub': return `${group(convertChildren(child(el, 'e')))}_${group(convertChildren(child(el, 'sub')))}`;
    case 'sSubSup':
      return `${group(convertChildren(child(el, 'e')))}_${group(convertChildren(child(el, 'sub')))}^${group(convertChildren(child(el, 'sup')))}`;
    case 'sPre':
      return `{}_${group(convertChildren(child(el, 'sub')))}^${group(convertChildren(child(el, 'sup')))}${group(convertChildren(child(el, 'e')))}`;
    case 'rad': {
      const deg = flag(el, 'radPr', 'degHide') ? '' : convertChildren(child(el, 'deg')).trim();
      return `\\sqrt${deg ? `[${deg}]` : ''}${group(convertChildren(child(el, 'e')))}`;
    }
    case 'nary': return convertNary(el);
    case 'd': return convertDelimited(el);
    case 'func': return convertFunction(el);
    case 'limLow': {
      const base = convertChildren(child(el, 'e')).trim();
      const lim = convertChildren(child(el, 'lim'));
      return FUNCTIONS.has(base) ? `\\${base}_${group(lim)}` : `\\underset${group(lim)}${group(base)}`;
    }
    case 'limUpp': return `\\overset${group(convertChildren(child(el, 'lim')))}${group(convertChildren(child(el, 'e')))}`;
    case 'acc': {
      const chr = prop(el, 'accPr', 'chr') ?? '̂';
      return `${ACCENTS[chr] ?? '\\hat'}${group(convertChildren(child(el, 'e')))}`;
    }
    case 'bar':
      return `${prop(el, 'barPr', 'pos') === 'top' ? '\\overline' : '\\underline'}${group(convertChildren(child(el, 'e')))}`;
    case 'groupChr': {
      const chr = prop(el, 'groupChrPr', 'chr') ?? '⏟';
      const body = group(convertChildren(child(el, 'e')));
      if (chr === '⏟') return `\\underbrace${body}`;
      if (chr === '⏞') return `\\overbrace${body}`;
      return prop(el, 'groupChrPr', 'pos') === 'top' ? `\\overset{${escapeText(chr)}}${body}` : `\\underset{${escapeText(chr)}}${body}`;
    }
    case 'borderBox': return `\\boxed${group(convertChildren(child(el, 'e')))}`;
    case 'm': return convertMatrix(el);
    case 'eqArr':
      return `\\begin{gathered}${mathChildren(el).filter((c) => c.localName === 'e').map(convertChildren).join(' \\\\ ')}\\end{gathered}`;
    case 'oMathPara':
      return mathChildren(el).filter((c) => c.localName === 'oMath').map(convertChildren).join(' \\\\ ');
    default:
      // Property blocks describe the layout handled above; everything else
      // (m:oMath, m:e, m:box, m:phant, ...) is a container of its children.
      return el.localName.endsWith('Pr') ? '' : convertChildren(el);
  }
}

/** The LaTeX for an m:oMath or m:oMathPara element. */
export function ommlToLatex(el: Element): string {
  return convertElement(el).replace(/\s+/g, ' ').trim();
}

/** The formula's characters in reading order — what is left when its layout cannot be converted. */
export function ommlPlainText(el: Element): string {
  return Array.from(el.getElementsByTagNameNS(MATH_NS, 't')).map((t) => t.textContent ?? '').join('');
}
