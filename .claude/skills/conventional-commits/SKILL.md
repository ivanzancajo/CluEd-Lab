---
name: conventional-commits
description: Writes commit messages following the Conventional Commits specification. Use when the user wants to commit changes, needs a commit message, or asks to format git logs.
---

When writing a commit message:

1. Run git diff --cached to inspect the staged changes.

2. Write the commit message following this format:

## Format
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]

## Rules
Types: Use feat for new features, fix for bug fixes, docs for documentation, style for code formatting (white-space, semi-colons), refactor for rewriting code without changing behavior, test for adding missing tests, and chore for updating build tasks or package dependencies.

Description: Use the imperative mood (e.g., "add", "fix" instead of "added", "fixes"). Start with lowercase and do not end with a period.

Breaking Changes: If the change breaks backwards compatibility, append an ! after the type/scope, or include BREAKING CHANGE: at the beginning of the footer section.
