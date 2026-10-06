import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { resolveRelativePath, type RenderContext } from './links';
import { HastContent } from './MarkdownView';
import { renderMarkdown } from './pipeline';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, source: string) => {
      if (source.includes('broken')) throw new Error('Parse error on line 1');
      return { svg: '<svg data-testid="diagram"><text>ok</text></svg>' };
    }),
  },
}));

const context: RenderContext = {
  documentPath: 'Infrastructure/Servers/BUZHULK.md',
  title: 'BUZHULK',
  documents: [
    { id: 'id-buzhulk', title: 'BUZHULK', path: 'Infrastructure/Servers/BUZHULK.md' },
    {
      id: 'id-ha',
      title: 'Home Assistant',
      path: 'Applications/Home Assistant.md',
      aliases: ['HASS'],
    },
    { id: 'id-vlan', title: 'VLAN', path: 'Network/VLAN.md' },
    { id: 'id-backup', title: 'Backup & Restore', path: 'Procedures/Backup Restore.md' },
  ],
};

function html(markdown: string, ctx: RenderContext = context): string {
  const { tree } = renderMarkdown(markdown, ctx);
  return renderToStaticMarkup(
    <MemoryRouter>
      <HastContent tree={tree} />
    </MemoryRouter>,
  );
}

describe('Markdown rendering', () => {
  it('renders GFM: tables (wrapped for scrolling), task lists, strikethrough', () => {
    const out = html('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~old~~\n');
    expect(out).toContain('<div class="table-wrap"><table>');
    expect(out).toContain('<input type="checkbox" disabled="" checked=""/> done');
    expect(out).toContain('<del>old</del>');
  });

  it('gives headings stable ids and returns the table of contents', () => {
    const { headings } = renderMarkdown('## Hardware\n\n### Disk *SSD*\n\n## Hardware\n', context);
    expect(headings).toEqual([
      { id: 'hardware', depth: 2, text: 'Hardware' },
      { id: 'disk-ssd', depth: 3, text: 'Disk SSD' },
      { id: 'hardware-1', depth: 2, text: 'Hardware' },
    ]);
    expect(html('## Hardware\n')).toContain('<h2 id="hardware">Hardware</h2>');
  });

  it('prefixes heading ids that would shadow window properties', () => {
    expect(renderMarkdown('## Location\n', context).headings[0]?.id).toBe('section-location');
  });

  it('does not repeat a leading H1 that equals the title (P4-09)', () => {
    expect(html('# BUZHULK\n\nText\n')).not.toContain('<h1');
    expect(html('# Something else\n')).toContain('<h1');
    expect(html('Intro\n\n# BUZHULK\n')).toContain('<h1');
  });

  it('renders callouts with title and type class', () => {
    const out = html(':::warning\nDo not enable Secure Boot.\n:::\n');
    expect(out).toContain('<div class="callout callout--warning" data-callout="warning">');
    expect(out).toContain('<p class="callout__title">Warning</p>');
  });

  it('renders code blocks with language label, copy button and highlighting', () => {
    const out = html('```yaml\nservices:\n  app:\n    image: nginx # web\n```\n');
    expect(out).toContain('<span class="code-block__lang">yaml</span>');
    expect(out).toContain('aria-label="Copy code"');
    expect(out).toContain('hljs-attr');
    expect(out).toContain('hljs-comment');
    expect(html('```\nplain\n```\n')).toContain('<span class="code-block__lang">text</span>');
  });

  describe('links', () => {
    it('resolves wiki links by title or file name, including heading anchors', () => {
      const out = html('[[Home Assistant]] [[vlan#IoT Devices]] [[Backup Restore|backups]]\n');
      expect(out).toMatch(/<a href="\/doc\/id-ha"[^>]*>Home Assistant<\/a>/);
      expect(out).toMatch(/<a href="\/doc\/id-vlan#iot-devices"[^>]*>vlan › IoT Devices<\/a>/);
      expect(out).toMatch(/<a href="\/doc\/id-backup"[^>]*>backups<\/a>/);
    });

    it('resolves wiki links through front matter aliases (P9-02)', () => {
      expect(html('[[hass]]\n')).toMatch(/<a href="\/doc\/id-ha"[^>]*>hass<\/a>/);
    });

    it('marks missing documents as broken links (UI_SPEC §76)', () => {
      expect(html('[[Old Server]]\n')).toContain(
        '<span class="broken-link" title="Document not found">Old Server</span>',
      );
      expect(html('[gone](../../Gone.md)\n')).toContain('class="broken-link"');
      expect(html('[escape](../../../../etc/x.md)\n')).toContain('class="broken-link"');
    });

    it('resolves relative Markdown links against the document folder', () => {
      expect(html('[VLAN](../../Network/VLAN.md#subnets)\n')).toMatch(
        /<a href="\/doc\/id-vlan#subnets"[^>]*>VLAN<\/a>/,
      );
      expect(html('[b](../../Procedures/Backup%20Restore.md)\n')).toContain(
        'href="/doc/id-backup"',
      );
    });

    it('resolves attachment URLs and opens external links in a new tab', () => {
      expect(html('[cfg](BUZHULK.assets/compose.yaml)\n')).toContain(
        'href="/api/v1/documents/id-buzhulk/attachments/compose.yaml"',
      );
      expect(html('<https://example.com>\n')).toContain(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">',
      );
    });

    it('keeps footnote links pointing at their (prefixed) targets', () => {
      const out = html('Text[^1]\n\n[^1]: Note.\n');
      const hrefs = [...out.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
      const ids = new Set([...out.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(ids.has(href)).toBe(true);
    });

    it('resolves relative paths safely', () => {
      expect(resolveRelativePath('A/B', '../C/d.md')).toBe('A/C/d.md');
      expect(resolveRelativePath('', './x.md')).toBe('x.md');
      expect(resolveRelativePath('A', '../../x.md')).toBeUndefined();
    });
  });

  it('allows harmless raw HTML such as details/summary and kbd', () => {
    const out = html(
      '<details><summary>More</summary>\n\nHidden **text**\n\n</details>\n\nPress <kbd>Ctrl</kbd>\n',
    );
    expect(out).toContain('<details><summary>More</summary>');
    expect(out).toContain('<kbd>Ctrl</kbd>');
  });
});

/** P4-07: the renderer must never let executable content through (PROJECT_SPEC §52, RULE 15). */
describe('XSS protection', () => {
  const payloads: [string, string][] = [
    ['script tag', '<script>alert(1)</script>'],
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['svg onload', '<svg onload=alert(1)><circle /></svg>'],
    ['svg script', '<svg><script>alert(1)</script></svg>'],
    ['iframe', '<iframe src="https://evil.example"></iframe>'],
    ['object/embed', '<object data="x.swf"></object><embed src="x.swf">'],
    ['javascript link (markdown)', '[click](javascript:alert(1))'],
    ['javascript link (html)', '<a href="javascript:alert(1)">click</a>'],
    ['javascript link (entity-encoded)', '<a href="jav&#x09;ascript:alert(1)">click</a>'],
    ['vbscript link', '<a href="vbscript:msgbox(1)">click</a>'],
    ['data: html link', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['javascript image', '![x](javascript:alert(1))'],
    ['style attribute', '<div style="background:url(javascript:alert(1))">x</div>'],
    ['style element', '<style>body{display:none}</style>'],
    ['details ontoggle', '<details open ontoggle=alert(1)><summary>x</summary></details>'],
    ['form', '<form action="https://evil.example"><input name="password"></form>'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
    ['base tag', '<base href="https://evil.example/">'],
    ['link tag', '<link rel="stylesheet" href="https://evil.example/x.css">'],
    [
      'mutation XSS',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>',
    ],
    ['noscript', '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'],
    ['callout label HTML', ':::note[<img src=x onerror=alert(1)>]\nx\n:::'],
    ['wiki link payload', '[[<img src=x onerror=alert(1)>]]'],
  ];

  const FORBIDDEN_TAGS = new Set([
    'SCRIPT',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'STYLE',
    'FORM',
    'META',
    'BASE',
    'LINK',
    'NOSCRIPT',
    'TEMPLATE',
  ]);
  const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset'];

  /** Inspects the real DOM produced from the output — escaped text can never trigger these. */
  function dangerousParts(markup: string): string[] {
    const doc = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');
    const problems: string[] = [];
    for (const element of doc.body.querySelectorAll('*')) {
      if (FORBIDDEN_TAGS.has(element.tagName.toUpperCase())) problems.push(`<${element.tagName}>`);
      for (const attribute of element.attributes) {
        const name = attribute.name.toLowerCase();
        // eslint-disable-next-line no-control-regex -- browsers ignore control characters in URLs
        const value = attribute.value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
        if (name.startsWith('on')) problems.push(`${name}=`);
        if (name === 'style') problems.push('style=');
        if (URL_ATTRIBUTES.includes(name) && /^(javascript|vbscript|data:text\/html)/.test(value)) {
          problems.push(`${name}=${value}`);
        }
      }
    }
    return problems;
  }

  it.each(payloads)('%s', (_name, payload) => {
    expect(dangerousParts(html(`${payload}\n`))).toEqual([]);
  });

  it('the checker itself detects dangerous markup', () => {
    expect(
      dangerousParts('<img src=x onerror=alert(1)><a href="javascript:x">a</a><script></script>'),
    ).toEqual(['onerror=', 'href=javascript:x', '<SCRIPT>']);
  });

  it('prefixes ids from raw HTML to prevent DOM clobbering', () => {
    expect(html('<div id="location">x</div>\n')).toContain('id="user-content-location"');
  });
});

describe('Mermaid', () => {
  it('renders diagrams with the lazily loaded library', async () => {
    const { tree } = renderMarkdown('```mermaid\nflowchart LR\n  A --> B\n```\n', context);
    render(
      <MemoryRouter>
        <HastContent tree={tree} />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('diagram')).toBeInTheDocument();
    const mermaid = (await import('mermaid')).default;
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict' }),
    );
  });

  it('shows an error and the source for invalid diagrams without breaking the page', async () => {
    const { tree } = renderMarkdown(
      'Before\n\n```mermaid\nbroken diagram\n```\n\nAfter\n',
      context,
    );
    render(
      <MemoryRouter>
        <HastContent tree={tree} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Diagram rendering error')).toBeInTheDocument();
    expect(screen.getByText(/broken diagram/)).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });
});
