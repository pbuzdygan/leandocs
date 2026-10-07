#!/usr/bin/env node
// Release channels (owner decision D-51): a GitHub release decides what is published to GHCR.
//   tag `X.Y.Z`     → commit must be on `main` → image tags `X.Y.Z` and `latest`
//   tag `devX.Y.Z`  → commit must be on `dev`  → image tags `devX.Y.Z` and `dev_latest`
// `X.Y.Z` must equal the root package.json version. The two channels never share an image tag.
//
// Usage (in the release workflow): node scripts/release-tags.mjs <git tag> <image>
// Writes `version`, `branch` and `tags` to $GITHUB_OUTPUT (or prints them).
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} tag Git tag of the GitHub release.
 * @param {string} packageVersion Root package.json version.
 * @returns {{ channel: 'main' | 'dev', branch: string, version: string, tags: string[] }}
 */
export function resolveRelease(tag, packageVersion) {
  const match = /^(dev)?(\d+\.\d+\.\d+)$/.exec(tag);
  if (!match) {
    throw new Error(`Release tag "${tag}" must be X.Y.Z (main) or devX.Y.Z (dev).`);
  }
  const [, dev, number] = match;
  if (number !== packageVersion) {
    throw new Error(
      `Release tag "${tag}" does not match package.json version ${packageVersion}. ` +
        'The tag must point to a commit whose package.json files carry that version: set it, push ' +
        'it, delete this release and its tag, and create the release again (docs/development.md, Releasing).',
    );
  }
  return dev
    ? { channel: 'dev', branch: 'dev', version: tag, tags: [tag, 'dev_latest'] }
    : { channel: 'main', branch: 'main', version: number, tags: [number, 'latest'] };
}

function main() {
  const [tag, image] = process.argv.slice(2);
  if (!tag || !image) throw new Error('Usage: release-tags.mjs <git tag> <image>');
  const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const release = resolveRelease(tag, rootPackage.version);
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
