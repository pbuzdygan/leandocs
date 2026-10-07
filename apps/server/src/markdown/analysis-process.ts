import {
  analyseMarkdown,
  convertHtml,
  failureReason,
  type AnalysisResult,
  type ConversionResult,
} from './analysis.js';

/** One task sent by ProcessAnalyser. */
export type Task = { task: 'analyse'; input: string } | { task: 'convert-html'; input: Uint8Array };

/**
 * Child process of ProcessAnalyser (ADR-0025): runs one task at a time and answers by id.
 * Running out of memory or being stopped ends only this process.
 */
if (!process.send) throw new Error('analysis-process must be started by ProcessAnalyser');

process.on('message', ({ id, ...task }: Task & { id: number }) => {
  let result: AnalysisResult | ConversionResult;
  if (task.task === 'convert-html') result = convertHtml(task.input);
  else
    try {
      result = { ok: true, analysis: analyseMarkdown(task.input) };
    } catch (error) {
      result = { ok: false, reason: failureReason(error) };
    }
  process.send!({ id, result });
});
// The server went away: never outlive it.
process.on('disconnect', () => process.exit(0));
