# AGENTS.md

## 1. Purpose

This repository archives PopKart (Chinese KartRider) client versions.

The main runtime responsibilities are:
- discover latest patch metadata,
- compute file diffs against the previously archived version,
- download/update/remove local client files,
- validate integrity,
- produce full and patch zip archives,
- rebuild cache artifacts for future runs,
- update `meta.json` as the latest archived version marker.

Treat this file as the operating manual for human or AI contributors.

## 2. Technology Stack

- Runtime: Node.js 24.x
- Package manager: pnpm 11.8.0
- Language: TypeScript (NodeNext module resolution)
- Execution style: `ts-node` for scripts
- Linting: ESLint via `@brownsugar/eslint-config`
- Tests: Vitest
- Networking:
  - native `fetch` for manifest and TCG endpoint requests,
  - `undici` (`request`, `stream`) for release metadata and file downloads.
- File operations:
  - `node:fs/promises`, `node:fs`, `node:path`,
  - `fs-extra` for robust file moves,
  - `zip-lib` for zip extraction and creation,
  - `utimes` for mtime restoration,
  - `zlib` streams for gzip extraction.
- CI platform: GitHub Actions (Windows runners)

## 3. High-Level Architecture

### 3.1 Entry points

- `src/check.ts`
  - discovers latest patch info from socket,
  - falls back to `TCG_SERVER_ENDPOINT` if configured,
  - compares against `meta.version`,
  - exports GitHub Action outputs (`endpoint`, `id`, `version`, `mode`) when a new version exists.

- `src/restore-cache.ts`
  - restores cached full client zip files from `cache/` into `client/`,
  - removes cache directory after extraction.

- `src/archive.ts`
  - the full archive pipeline,
  - orchestrates diff, download, removal, validation, archiving, cache rebuild, and metadata update.
  - archiving step is skipped when there are no `patchFiles` (nothing new or changed to download).
  - cache rebuild and meta update are skipped when `NODE_ENV === 'test'` or `VITEST === 'true'`.

### 3.2 Core modules

- `src/core/cli.ts`
  - strict parsing and validation for required archive CLI args.

- `src/core/patcher.ts`
  - loads current and previous manifests,
  - computes `newFiles`, `changedFiles`, `removedFiles`, and `patchFiles`,
  - resolves mode-dependent base URL rules.

- `src/core/downloader.ts`
  - downloads patch files with retries and concurrency,
  - kart mode: ungzip files before move,
  - full-client fallback: downloads latest release full archives and extracts them.

- `src/core/validator.ts`
  - validates local files by hash (CRC for kart mode, MD5 for tcg mode),
  - deletes corrupted files,
  - restores mtime for valid kart files.

- `src/core/archiver.ts`
  - builds patch/full zip outputs,
  - chunks output by remote file size budget (2 GB per zip chunk).

- `src/core/cache.ts`
  - rebuilds `cache/` from generated full-client archives,
  - normalizes names to `PopKart_Client_1.zip`, `PopKart_Client_2.zip`, etc.

- `src/core/types.ts`
  - defines shared interfaces: `ClientFilePair`, `PatchDiff`.
  - re-exports `KartPatchServerInfo` from `src/lib/kart-patch.ts`.

### 3.3 Shared libraries

- `src/lib/kart-patch.ts`: socket protocol and TCG endpoint parsing.
- `src/lib/kart-manifest.ts`: manifest file loading/parsing (`files.nfo2`, `NT.txf`).
- `src/lib/kart-files.ts`: file models and hash/CRC implementations.
- `src/lib/utils.ts`: URL join, gzip extraction, retries, concurrent map, CLI arg parsing, time helpers.
- `src/lib/paths.ts`: canonical path resolvers for all runtime directories/files.
- `src/lib/env.ts`: optional/required env var guards.
- `src/lib/buffer-manager.ts`: extends `buffer-reader` with helpers for reading binary socket data (booleans, shorts, length-prefixed UTF-16LE strings); used exclusively by `kart-patch.ts`.

## 4. Domain and Business Logic Rules

### 4.1 Version baseline logic

- The previous archived version baseline comes from `meta.json` (`meta.version`, `meta.id`).
- `check` exits early if `meta.version >= latestVersion`.
- `archive` compares current remote manifest against baseline manifest derived from `meta`.

### 4.2 Manifest source rules

- Mode `kart`:
  - endpoint is version-based,
  - manifest is `files.nfo2`,
  - hash validation uses CRC.
- Mode `tcg`:
  - endpoint path includes an ID token,
  - current manifest uses current patch ID,
  - previous manifest uses `meta.id`,
  - manifest is `NT.txf`,
  - hash validation uses MD5.

### 4.3 Diff and file operations

- `patchFiles` = new files + changed files.
- `removedFiles` = files in previous manifest but missing in current manifest.
- `removedFiles` are physically deleted from `client/` before validation.
- Archive zip creation is only performed when `patchFiles` is non-empty; a no-diff run skips it entirely.

### 4.4 Validation and fallback behavior

- Missing file or hash mismatch marks file invalid.
- Corrupted files are deleted and can be re-downloaded.
- If all files are invalid, archive flow downloads full client from latest GitHub release assets.
- If some files are invalid, only invalid files are re-downloaded.
- If invalid files remain after retry, pipeline fails.

### 4.5 Archive output behavior

- Patch archive naming:
  - `PopKart_Patch_P{previousVersion}_P{currentVersion}_{NN}.zip`
- Full archive naming:
  - `PopKart_Client_P{currentVersion}_{NN}.zip`
- Sequence starts from `01` and is zero padded.

### 4.6 CI outputs used for workflow branching

`src/archive.ts` sets GitHub Action outputs:
- `noClientCache = true` when there are no patch downloads and no removed files.
- `noFullClientCache = true` when full-client archives are unavailable for cache rebuild.

## 5. Repository Layout and Ownership

- `src/` implementation
- `tests/` unit tests for core and lib modules
- `client/` local working client files (large binaries, runtime artifact area)
- `archives/` generated release zips
- `cache/` generated/restored cache archive area (ephemeral)
- `meta.json` authoritative archived version pointer
- `server.json` default patch socket host/port

## 6. Local Development Workflow

## 6.1 Prerequisites

- Node.js 24.x
- pnpm 11.8.0
- Windows environment preferred (matches CI)

## 6.2 Install

```bash
pnpm i
```

## 6.3 Main commands

```bash
pnpm check
pnpm restore-cache
pnpm archive --endpoint=<url> --id=<token> --version=<number> --mode=<kart|tcg>
pnpm lint
pnpm lint:types
pnpm test
```

## 6.4 Typical local run

1. Run `pnpm check`.
2. If new version exists, optionally run `pnpm restore-cache`.
3. Run `pnpm archive --endpoint=... --id=... --version=... --mode=...`.
4. Validate outputs in `archives/` and `meta.json` changes.

## 7. CI/CD Behavior

### 7.1 `.github/workflows/ci.yml`

- Runs on pull requests and pushes to `main`.
- Executes lint and tests on Windows + Node 24.x.

### 7.2 `.github/workflows/main.yml`

- Triggers on schedule, manual dispatch, and version tag push.
- Sequence:
  1. `pnpm check`
  2. Restore cache (or lookup only if no new version)
  3. `pnpm restore-cache` when archiving is needed
  4. `pnpm archive ...`
  5. Save rebuilt cache if eligible
  6. Auto-commit `meta.json` and create tag `P<version>`
  7. Publish release with `archives/*.zip`

## 8. Testing Expectations

Current suite validates:
- CLI argument validation for archive entrypoint.
- Manifest diff behavior including removed files and mode-specific endpoint handling.
- Downloader behavior (empty no-op, release fetch errors, full-client fetch, tcg patch flow).
- Validator behavior (missing/corrupt/valid files, mtime restoration).
- Archiver naming and patch/full archive generation.
- Cache rebuild naming and ordering.
- Socket timeout behavior.
- Utility functions (`resolveUrl`, `ungzip`, `withRetry`, etc.).

When modifying behavior in `src/core/*` or `src/lib/*`, update tests in `tests/core/*` or `tests/lib/*` in the same change.

## 9. Agent Development Rules

- Keep changes minimal and focused.
- Do not commit large binary changes under `client/`, `archives/`, or `cache/` unless task explicitly requires it.
- Preserve mode-specific logic (`kart` vs `tcg`) and baseline-diff semantics with `meta.json`.
- Do not bypass validation fallback logic.
- Keep archive naming and chunk sequencing backward compatible.
- Maintain concurrency/retry behavior unless there is a deliberate reliability/performance change with tests.
- Prefer updating/adding tests for behavioral changes.
- When introducing reusable formatting or helper logic for entrypoints/workflows, place it in `src/lib/utils.ts` and add/update tests in `tests/lib/utils.test.ts`.
- Run at minimum:
  - `pnpm lint`
  - `pnpm lint:types`
  - `pnpm test`

## 10. Common Change Playbooks

### 10.1 Add a new pipeline step

1. Add logic in `src/archive.ts` in the correct sequence stage.
2. Keep failure handling under existing try/catch semantics.
3. Add or update entrypoint tests in `tests/core/archive.test.ts`.

### 10.2 Change manifest parsing

1. Update parser in `src/lib/kart-manifest.ts`.
2. Verify mode-specific assumptions still hold.
3. Update parser tests in `tests/lib/kart-manifest.test.ts`.

### 10.3 Change diff behavior

1. Update `src/core/patcher.ts`.
2. Keep `removedFiles` behavior explicit and tested.
3. Update `tests/core/patcher.test.ts`.

### 10.4 Change file hashing/validation

1. Update `src/lib/kart-files.ts` and/or `src/core/validator.ts`.
2. Ensure corruption handling and retry expectations remain deterministic.
3. Update `tests/lib/kart-files.test.ts` and `tests/core/validator.test.ts`.

## 11. Known Notes and Risks

- Runtime depends on external endpoints and release assets; keep error messages clear and actionable.
- `client/` and archive operations can be large; avoid unnecessary full-directory operations in new code.

## 12. Definition of Done for Changes

A change is complete when:
1. implementation is correct for both `kart` and `tcg` paths where applicable,
2. tests cover the behavior change,
3. `pnpm lint:types` and `pnpm test` pass,
4. archive/check/cache outputs and workflow conditions remain compatible.
