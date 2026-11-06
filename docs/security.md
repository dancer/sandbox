# dependency security

Run `bun run audit` after `bun install --frozen-lockfile`. CI runs this command
after the full verification suite. It checks every dependency and fails on new
advisories, including low-severity findings

Two advisory IDs have explicit exceptions as of November 6, 2026:

| advisory                                                                            | resolution                                                                                                                                                                                                                                                      | removal condition                                                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), Deepmerge | the [official CVE record](https://cveawg.mitre.org/api/cve/CVE-2026-93753) was rejected on November 2 because it does not describe a security vulnerability. The [upstream discussion](https://github.com/TehShrike/deepmerge/issues/273) records the rejection | remove when the registry advisory is withdrawn or Deepmerge leaves the dependency graph |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), Zod       | Vercel CLI helpers pin Zod 3.22.4. `patches/zod.patch` backports early collection-size rejection without replacing their Zod 3 API                                                                                                                              | remove the patch and exception when the CLI helpers use an upstream fixed version       |

The Zod patch follows the behavior of the [upstream fix](https://github.com/colinhacks/zod/commit/a0ebf97): oversized arrays and sets fail their upper bound before parsing elements or running collection refinements. It covers array `.max()` and `.length()`, and set `.max()` and `.size()`, in the CommonJS, ESM and UMD builds. Zod 3 maps do not expose size constraints. Valid input and unbounded collections retain their existing behavior

`bun run audit` first runs `test/security.test.ts`. These tests reproduce the
oversized-collection bug, check synchronous and asynchronous parsing, preserve
valid parsing and nested issue paths, and verify all four legacy CLI consumers
use the patched package. The exception only permits the reviewed lockfile
versions: patched 3.22.4 and upstream-fixed 4.6.7. Changing either version requires
reviewing this guard and removing the exception when possible

Bun applies the patch during installation through the root
`patchedDependencies` entry. The registry audit only sees the original package
version, so its Zod finding persists in plain `bun audit`. The guarded command
accounts for the local fix. This patch protects this repository's tooling. It
does not change published SDK dependency requirements
