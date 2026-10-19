import type { Element, ElementContent, Root, RootContent } from 'hast';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

// Only the languages lessons use: rehype-highlight bundles 37 of them, which
// added a fifth to the size of the whole site. Each grammar brings its aliases
// (js, jsx, ts, tsx, html, sh, py, cs, yml...).
const lowlight = createLowlight({
  bash, c, cpp, csharp, css, java, javascript, json, markdown, python, scss, shell, sql, typescript, xml, yaml,
});

/**
 * The languages guessed among for a code block that names none, as most pasted
 * and converted lessons do. CSS and SCSS are left out on purpose: the guess took
 * plain JavaScript and Python for CSS. A block marked ```css is still coloured.
 */
const DETECT = ['javascript', 'typescript', 'xml', 'json', 'bash', 'python', 'java', 'csharp', 'sql'];

function textOf(node: Root | RootContent): string {
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(textOf).join('') : '';
}

function classesOf(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

/** The language a block names: a name, `null` for none, or `false` when it asks not to be coloured. */
function languageOf(code: Element): string | null | false {
  for (const name of classesOf(code)) {
    if (name === 'no-highlight' || name === 'nohighlight') return false;
    if (name.startsWith('language-')) return name.slice('language-'.length);
    if (name.startsWith('lang-')) return name.slice('lang-'.length);
  }
  return null;
}

function highlight(code: Element) {
  const language = languageOf(code);
  if (language === false) return;
  // A language this build doesn't know stays plain rather than being guessed.
  if (language && !lowlight.registered(language)) return;
  const text = textOf(code);
  let tree: Root;
  try {
    tree = language ? lowlight.highlight(language, text) : lowlight.highlightAuto(text, { subset: DETECT });
  } catch {
    return;
  }
  const detected = tree.data?.language;
  code.properties.className = [
    'hljs',
    ...classesOf(code),
    ...(!language && detected ? [`language-${detected}`] : []),
  ];
  code.children = tree.children as ElementContent[];
}

function walk(node: Root | Element) {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    if (child.tagName === 'code' && node.type === 'element' && node.tagName === 'pre') highlight(child);
    else walk(child);
  }
}

/** Rehype plugin: colours the code blocks of rendered Markdown with highlight.js classes. */
export function rehypeHighlightCode() {
  return (tree: Root) => walk(tree);
}
