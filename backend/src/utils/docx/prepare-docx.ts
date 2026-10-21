import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { MATH_NS, ommlPlainText, ommlToLatex } from './omml-to-latex';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

/** The parts of a .docx whose text mammoth converts. */
const CONTENT_PARTS = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];

/**
 * Wrappers that only group the text inside them (custom XML tags, simple
 * fields, right-to-left embedding, tracked moves). mammoth does not know them
 * and drops each one together with everything inside, which cut paragraphs —
 * sometimes the whole rest of a document — out of the result.
 */
const TRANSPARENT_WRAPPERS = ['customXml', 'fldSimple', 'dir', 'bdo', 'moveTo'];

export interface DocxFormula {
  /** Stands in for the formula in the text until the Markdown is final, since LaTeX would not survive HTML-to-Markdown escaping. */
  token: string;
  latex: string;
  /** A formula on its own line (Word's "display" equation), rather than one inside a sentence. */
  display: boolean;
}

export const formulaToken = (i: number) => `DOCXMATH${i}X`;

function elements(root: Document | Element, ns: string, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS(ns, name));
}

function directChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/**
 * mammoth reads only the fallback of a compatibility block. When the block has
 * no fallback, or its preferred version is an equation (whose fallback is just
 * a picture of it), the preferred version is kept instead.
 */
function resolveAlternateContent(doc: Document): void {
  for (const block of elements(doc, MC_NS, 'AlternateContent').reverse()) {
    const choice = directChildren(block).find((c) => c.namespaceURI === MC_NS && c.localName === 'Choice');
    const fallback = directChildren(block).find((c) => c.namespaceURI === MC_NS && c.localName === 'Fallback');
    if (!choice) continue;
    const hasMath = choice.getElementsByTagNameNS(MATH_NS, 'oMath').length > 0;
    if (hasMath || !fallback || directChildren(fallback).length === 0) {
      unwrap(choice);
      if (fallback) block.removeChild(fallback);
      unwrap(block);
    }
  }
}

function unwrapContainers(doc: Document): void {
  for (const name of TRANSPARENT_WRAPPERS) {
    for (const el of elements(doc, W_NS, name).reverse()) unwrap(el);
  }
}

/** Swaps every equation for a token in a plain run, collecting its LaTeX. */
function extractFormulas(doc: Document, formulas: DocxFormula[]): void {
  const roots = [
    ...elements(doc, MATH_NS, 'oMathPara'),
    ...elements(doc, MATH_NS, 'oMath').filter((m) => (m.parentNode as Element | null)?.localName !== 'oMathPara'),
  ];
  for (const root of roots) {
    let latex: string;
    try {
      latex = ommlToLatex(root);
    } catch (err) {
      console.error('[prepare-docx] equation conversion failed, keeping its text', err);
      latex = `\\text{${ommlPlainText(root).replace(/[\\{}]/g, '')}}`;
    }
    const token = formulaToken(formulas.length);
    formulas.push({ token, latex, display: root.localName === 'oMathPara' });

    const run = doc.createElementNS(W_NS, 'w:r');
    const text = doc.createElementNS(W_NS, 'w:t');
    text.appendChild(doc.createTextNode(token));
    run.appendChild(text);
    root.parentNode?.replaceChild(run, root);
  }
}

/**
 * mammoth finds a picture only when it is the drawing itself. Pictures inside
 * a group, a drawing canvas or a shape's fill were skipped, so each one is
 * also listed as a plain picture of the drawing.
 */
function exposeNestedPictures(doc: Document): void {
  for (const data of elements(doc, A_NS, 'graphicData')) {
    if (directChildren(data).some((c) => c.namespaceURI === PIC_NS && c.localName === 'pic')) continue;
    for (const blip of elements(data, A_NS, 'blip')) {
      const pic = doc.createElementNS(PIC_NS, 'pic:pic');
      const fill = doc.createElementNS(PIC_NS, 'pic:blipFill');
      fill.appendChild(blip.cloneNode(true));
      pic.appendChild(fill);
      data.appendChild(pic);
    }
  }
}

/**
 * The text of a modern text box lives inside its drawing, which mammoth reads
 * only for pictures. A copy of the text is placed right after the drawing,
 * where it is read like the text boxes of older documents.
 */
function exposeTextBoxes(doc: Document): void {
  for (const drawing of elements(doc, W_NS, 'drawing')) {
    for (const box of elements(drawing, W_NS, 'txbxContent').reverse()) {
      drawing.parentNode?.insertBefore(box.cloneNode(true), drawing.nextSibling);
    }
  }
}

/**
 * Rewrites the parts of a Word file that mammoth would lose — equations,
 * grouped pictures, text boxes, wrapped text — into forms it converts. The
 * equations come back separately, to be put into the Markdown as LaTeX.
 */
export async function prepareDocx(buffer: Buffer): Promise<{ buffer: Buffer; formulas: DocxFormula[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const formulas: DocxFormula[] = [];
  for (const path of CONTENT_PARTS) {
    const file = zip.file(path);
    if (!file) continue;
    const doc = new DOMParser().parseFromString(await file.async('string'), 'text/xml');
    resolveAlternateContent(doc);
    unwrapContainers(doc);
    extractFormulas(doc, formulas);
    exposeNestedPictures(doc);
    exposeTextBoxes(doc);
    zip.file(path, new XMLSerializer().serializeToString(doc));
  }
  return { buffer: await zip.generateAsync({ type: 'nodebuffer' }), formulas };
}
