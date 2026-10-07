import { afterEach, describe, expect, it } from 'vitest';
import { ProcessAnalyser } from './process-analyser.js';
import { MAX_ANALYSED_BYTES } from './analysis.js';

const analysers: ProcessAnalyser[] = [];
function analyser(limits?: ConstructorParameters<typeof ProcessAnalyser>[0]): ProcessAnalyser {
  const created = new ProcessAnalyser(limits);
  analysers.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(analysers.splice(0).map((created) => created.close()));
});

describe('ProcessAnalyser', () => {
  it('extracts links, headings and text in a separate process', async () => {
    const result = await analyser().analyse('# Title\n\nSee [[Other]] and [doc](a/b.md).\n');
    expect(result).toEqual({
      ok: true,
      analysis: {
        headings: ['Title'],
        links: [
          expect.objectContaining({ kind: 'wiki', target: 'Other' }),
          expect.objectContaining({ kind: 'markdown', path: 'a/b.md' }),
        ],
        text: expect.stringContaining('See'),
      },
    });
  });

  it('stops a document that takes too long and keeps serving the next ones', async () => {
    // Long enough for a new worker to start; the crafted document needs minutes.
    const limited = analyser({ timeoutMs: 3000, maxHeapMb: 256 });
    const slow = limited.analyse(`${'*'.repeat(40_000)}x${'*'.repeat(40_000)}`);
    const next = limited.analyse('# Next\n');
    expect(await slow).toEqual({
      ok: false,
      reason: 'too complex to read within 3 seconds',
    });
    expect(await next).toMatchObject({ ok: true, analysis: { headings: ['Next'] } });
  });

  it('survives the memory limit in cases that abort a worker thread', async () => {
    // A worker thread with this heap limit took the whole process down (exit code 134).
    const nested = analyser({ timeoutMs: 60_000, maxHeapMb: 128 });
    expect(await nested.analyse(`${'>'.repeat(20_000)} x\n`)).toEqual({
      ok: false,
      reason: 'too large to read within 128 MiB of memory',
    });
    expect(await nested.analyse('ok')).toMatchObject({ ok: true });
  });

  it('limits deep nesting instead of failing', async () => {
    // Depending on the input this hits the stack or the memory limit; both are contained.
    const nested = analyser({ timeoutMs: 60_000, maxHeapMb: 512 });
    expect(await nested.analyse(`${'>'.repeat(20_000)} x\n`)).toMatchObject({ ok: false });
    expect(await nested.analyse('ok')).toMatchObject({ ok: true });
  });

  it('survives running out of memory', async () => {
    const small = analyser({ timeoutMs: 60_000, maxHeapMb: 32 });
    const big = Array.from({ length: 40_000 }, (_, index) => `- item [${index}](x.md)`).join('\n');
    expect(await small.analyse(big)).toEqual({
      ok: false,
      reason: 'too large to read within 32 MiB of memory',
    });
    expect(await small.analyse('ok')).toMatchObject({ ok: true });
  });

  it('converts imported HTML in the separate process', async () => {
    const converting = analyser();
    const html = (body: string) => new TextEncoder().encode(`<html><body>${body}</body></html>`);
    expect(await converting.convertHtml(html('<h1>Hi</h1><p><b>bold</b></p>'))).toMatchObject({
      ok: true,
      converted: { text: '# Hi\n\n**bold**\n', converted: true },
    });
    expect(await converting.convertHtml(html('<div>'.repeat(5_000)))).toEqual({
      ok: false,
      reason: 'nested too deeply',
    });
    expect(
      await converting.convertHtml(new TextEncoder().encode('<meta charset="x-unknown"><p>a</p>')),
    ).toEqual({
      ok: false,
      reason: 'The character encoding "x-unknown" is not supported',
      userError: true,
    });
  });

  it('does not parse bodies above the size limit', async () => {
    expect(await analyser().analyse('x'.repeat(MAX_ANALYSED_BYTES + 1))).toEqual({
      ok: false,
      reason: 'larger than 2 MiB',
    });
  });

  it('rejects pending work when closed', async () => {
    const closing = analyser();
    const rejected = expect(closing.analyse('# A\n')).rejects.toThrow(
      'Markdown analysis has stopped',
    );
    await closing.close();
    await rejected;
    await expect(closing.analyse('# B\n')).rejects.toThrow('Markdown analysis has stopped');
  });
});
