# changesets

use changesets for publishable package changes

docs-only, website-only, example-only, ci-only, and test-only changes do not need
a changeset unless they change published package behavior

package versions are fixed together for launch so every `@sandbox-sdk/*`
package releases at the same version

production docs should deploy from the `production` branch, not from `main`
the release workflow updates `production` only after packages publish

run `bun run verify` before opening or merging the version pull request
