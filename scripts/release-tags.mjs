#!/usr/bin/env node
// Release channels (owner decision D-51): a GitHub release decides what is published to GHCR.
//   tag `X.Y.Z`     → commit must be on `main` → image tags `X.Y.Z` and `latest`
//   tag `devX.Y.Z`  → commit must be on `dev`  → image tags `devX.Y.Z` and `dev_latest`
// The tag is the release version (D-53): it is baked into the image through LEANDOCS_VERSION, so
// package.json does not have to be edited before a release. The two channels never share a tag.
//
// Usage (in the release workflow): node scripts/release-tags.mjs <git tag> <image>
// Writes `version`, `branch` and `tags` to $GITHUB_OUTPUT (or prints them).
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} tag Git tag of the GitHub release.
 * @returns {{ channel: 'main' | 'dev', branch: string, version: string, tags: string[] }}
 */
export function resolveRelease(tag) {
  const match = /^(dev)?(\d+\.\d+\.\d+)$/.exec(tag);
  if (!match) {
    throw new Error(`Release tag "${tag}" must be X.Y.Z (main) or devX.Y.Z (dev).`);
  }
  const [, dev, number] = match;
  return dev
    ? { channel: 'dev', branch: 'dev', version: tag, tags: [tag, 'dev_latest'] }
    : { channel: 'main', branch: 'main', version: number, tags: [number, 'latest'] };
}

function main() {
  const [tag, image] = process.argv.slice(2);
  if (!tag || !image) throw new Error('Usage: release-tags.mjs <git tag> <image>');
  const release = resolveRelease(tag);
  try {
    // Exit code 1 means "not an ancestor": the release was made from the wrong branch.
    execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', `origin/${release.branch}`]);
  } catch {
    throw new Error(
      `Release tag "${tag}" must point to a commit on the ${release.branch} branch. ` +
        'Delete this release and its tag, and create it again on that branch.',
    );
  }
  const output = [
    `version=${release.version}`,
    `branch=${release.branch}`,
    'tags<<EOF',
    ...release.tags.map((name) => `${image}:${name}`),
    'EOF',
    '',
  ].join('\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
