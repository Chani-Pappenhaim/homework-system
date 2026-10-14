import { describe, it, expect } from 'vitest';
import { teacherReplyHtml, studentMessageHtml, studentReplyHtml, deadlineReportHtml, wrapRtl } from '../../src/emails/email.templates';

describe('message emails', () => {
  it('gives every paragraph and quote its own right-to-left direction', () => {
    const html = teacherReplyHtml({
      messageId: 'm1', studentEmail: 's@x.com', studentName: 'רחל',
      originalContent: 'שאלה ראשונה', replyContent: 'תשובה',
    });
    expect(html).toMatch(/^<!DOCTYPE html><html dir="rtl" lang="he">/);
    const blocks = html.match(/<(p|blockquote)[\s>][^>]*>/g) ?? [];
    expect(blocks.length).toBeGreaterThan(3);
    for (const tag of blocks) expect(tag).toContain('dir="rtl"');
  });

  it('shows what a student wrote as text, not as markup', () => {
    const html = studentMessageHtml({
      messageId: 'm1', studentName: '<b>רחל</b>', studentEmail: 's@x.com',
      content: 'שלום <a href="https://evil.example">לחצי כאן</a>', assignmentTitle: 'מטלה <i>1</i>',
    });
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    expect(html).not.toContain('<b>רחל</b>');
    expect(html).not.toContain('<i>1</i>');
  });

  it('keeps the line breaks of a reply', () => {
    const html = studentReplyHtml({
      messageId: 'm1', studentName: 'רחל', studentEmail: 's@x.com',
      originalContent: 'א', replyContent: 'שורה 1\nשורה 2\r\nשורה 3',
    });
    expect(html).toContain('שורה 1<br>שורה 2<br>שורה 3');
  });

  it('escapes the names in the deadline report', () => {
    const html = deadlineReportHtml({
      assignmentTitle: 'מטלה', courseName: '<script>x</script>', deadline: new Date().toISOString(),
      rows: [{ name: '<img src=x>', status: 'missing', submittedAt: null }],
    } as Parameters<typeof deadlineReportHtml>[0]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
  });

  it('does not touch tags that only start like a paragraph', () => {
    expect(wrapRtl('<pre>x</pre><p>y</p>')).toContain('<pre>x</pre><p dir="rtl">y</p>');
  });
});
