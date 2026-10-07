import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { fileToMarkdown, htmlToMarkdown } from '../../src/utils/content-convert';

/** The smallest .docx Word opens: one heading and one paragraph. */
function docx(): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  zip.addFile('_rels/.rels', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  zip.addFile('word/document.xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>מטלה</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>לכתוב קומפוננטה</w:t></w:r></w:p></w:body></w:document>'));
  return zip.toBuffer();
}

describe('content conversion', () => {
  it('passes Markdown through as is, without a BOM', async () => {
    expect(await fileToMarkdown('a.md', Buffer.from('\uFEFF# כותרת\n\n- א'))).toBe('# כותרת\n\n- א');
  });

  it('turns HTML into Markdown and drops scripts and styles', async () => {
    const md = await fileToMarkdown('A.HTML', Buffer.from(
      '<html><head><style>p{}</style></head><body><h2>שלום</h2><p>טקסט <strong>מודגש</strong></p><script>alert(1)</script><ul><li>א</li></ul></body></html>'));
    expect(md).toBe('## שלום\n\nטקסט **מודגש**\n\n-   א');
    expect(md).not.toContain('alert');
  });

  it('turns a Word document into Markdown', async () => {
    expect(await fileToMarkdown('task.docx', docx())).toBe('**מטלה**\n\nלכתוב קומפוננטה');
  });

  it('keeps code blocks fenced', () => {
    expect(htmlToMarkdown('<pre><code>const x = 1;</code></pre>')).toBe('```\nconst x = 1;\n```');
  });

  it('rejects other file types with a 400', async () => {
    await expect(fileToMarkdown('slides.pptx', Buffer.from(''))).rejects.toMatchObject({ status: 400 });
  });
});
