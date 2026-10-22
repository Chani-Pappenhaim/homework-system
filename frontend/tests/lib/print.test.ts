import { describe, it, expect, afterEach } from 'vitest';
import { printDocument, printElement } from '@/lib/print';

const frames = () => document.querySelectorAll('iframe#print-frame');

afterEach(() => { document.body.innerHTML = ''; document.head.querySelectorAll('style').forEach((s) => s.remove()); });

describe('printDocument', () => {
  it('puts the content under its title, with the page styles, right to left', () => {
    const style = document.createElement('style');
    style.textContent = '.x{color:red}';
    document.head.appendChild(style);
    const html = printDocument('תרגיל 1', '<p>שאלה</p>');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('.x{color:red}');
    expect(html).toMatch(/<h1[^>]*>תרגיל 1<\/h1><p>שאלה<\/p>/);
  });

  it('shows a title that looks like markup as plain text', () => {
    const html = printDocument('<b>כותרת</b>', '');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&#60;b&#62;כותרת');
  });
});

describe('printElement', () => {
  it('prints only the given part of the page, through a single hidden frame', () => {
    const part = document.createElement('div');
    part.innerHTML = '<p>חומר השיעור</p>';
    document.body.append(part, Object.assign(document.createElement('nav'), { textContent: 'תפריט' }));

    printElement(part, 'שיעור 1');
    printElement(part, 'שיעור 1');

    expect(frames()).toHaveLength(1);
    const frame = frames()[0] as HTMLIFrameElement;
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.srcdoc).toContain('<p>חומר השיעור</p>');
    expect(frame.srcdoc).not.toContain('תפריט');
  });
});
