---
name: git-flow-branching
description: Manages repository branching and development workflow using the git-flow model. Use when creating new branches, managing feature development, preparing releases, or applying hotfixes.
---

When managing branches or workflows:

1. Identify the nature of the change (new feature, bugfix, release preparation, or urgent production fix).
2. Determine the correct branching strategy and naming convention using this format:

## Base Branches
main: Production-ready code only.

develop: Integration branch for features and current development cycle.

## Supporting Branches
feature/: Branches off develop. Merges back into develop. Use for developing new features.

fix/: Branches off develop. Merges back into develop. Use for fixing bugs in the development cycle.

release/: Branches off develop. Merges into both main and develop. Use to prepare for a new production release.

hotfix/: Branches off main. Merges into both main and develop. Use for urgent fixes in production code.