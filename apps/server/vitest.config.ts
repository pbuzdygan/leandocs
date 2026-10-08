import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    // Integration tests use real directories, Argon2id sign-in (64 MiB per hash) and the Markdown
    // analysis child process. They take 1–4 s locally and several times longer on shared CI
    // runners, so the 5 s default made them fail at random there.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
