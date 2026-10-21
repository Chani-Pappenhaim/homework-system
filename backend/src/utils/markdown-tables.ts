import type TurndownService from 'turndown';

/** The table's own rows, not those of a table nested in one of its cells. */
function ownRows(table: HTMLElement): HTMLElement[] {
  return Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table) as HTMLElement[];
}

function cells(row: HTMLElement): HTMLElement[] {
  return Array.from(row.children).filter((c) => c.nodeName === 'TD' || c.nodeName === 'TH') as HTMLElement[];
}

/** A GFM cell is one line, and a bar would end it. */
function cellText(turndown: TurndownService, cell: HTMLElement): string {
  return turndown
    .turndown(cell.innerHTML)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * Turndown has no table rule, so a table came out as its cells one after
 * another, each its own paragraph. This writes it as a GFM table instead, its
 * first row as the header, the way Markdown requires one. A merged cell keeps
 * its place with empty cells after it.
 */
export function addTableRule(turndown: TurndownService): void {
  turndown.addRule('table', {
    filter: 'table',
    replacement(_content, node) {
      const rows = ownRows(node as HTMLElement).map((row) =>
        cells(row).flatMap((cell) => {
          const span = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
          return [cellText(turndown, cell), ...Array<string>(span - 1).fill('')];
        })
      );
      const width = Math.max(0, ...rows.map((r) => r.length));
      if (width === 0) return '';
      const line = (r: string[]) => `| ${[...r, ...Array<string>(width - r.length).fill('')].join(' | ')} |`;
      const [header, ...body] = rows;
      return `\n\n${[line(header!), line(Array<string>(width).fill('---')), ...body.map(line)].join('\n')}\n\n`;
    },
  });
}
