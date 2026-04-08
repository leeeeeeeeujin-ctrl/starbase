# Pokerogue embedded build notes

`/pokerogue/upstream` is built from a real Pokerogue source tree at build time, then our local custom files are overlaid on top before the build runs.

The build script:

- prefers `POKEROGUE_SOURCE_DIR` when set
- otherwise uses the local `../pokerogue-upstream` repo if it exists
- otherwise fresh-clones Pokerogue from Git and runs `git lfs pull`

This avoids shipping Git LFS pointer files as fake `png`/`wav` assets.

Current roles:

- `pokerogue-upstream`: real source repo / LFS-backed asset source
- `pokerogue-web`: our tracked custom overlay (source tweaks, Vite config, embedded runtime behavior)

## Recommended workflow

For ongoing customizations, keep a real editable Pokerogue repo outside the Next app and point the build at it:

```bash
set POKEROGUE_SOURCE_DIR=..\pokerogue-upstream
```

Later, once there is a dedicated fork, use:

```bash
set POKEROGUE_GIT_URL=https://github.com/<your-org>/<your-pokerogue-fork>.git
set POKEROGUE_GIT_REF=<branch>
```

In Vercel, configure the same environment variables so deploys pull from the maintained fork instead of the public upstream.
