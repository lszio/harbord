default: test

# ── Test ──────────────────────────────────────────────────────────

# Run unit tests
test:
    bun run test:run

# Run tests in watch mode
test-watch:
    bun run test

# Run e2e tests
test-e2e:
    bun run test:e2e

# ── Quality ───────────────────────────────────────────────────────

# Type-check without emitting
typecheck:
    bun run typecheck

# Full check (typecheck + test + e2e)
check: typecheck test test-e2e

# ── Build ─────────────────────────────────────────────────────────

# Build SDK, CLI, and type declarations
build:
    bun run build:all

# Build SDK only (for library consumers)
build-sdk:
    bun run build

# Build CLI binary only
build-cli:
    bun run build:cli

# Build type declarations only
build-types:
    bun run build:types

# ── Clean ─────────────────────────────────────────────────────────

# Remove all build artifacts and coverage data
clean:
    bun run clean

# Clean everything including node_modules
clean-all: clean
    rm -rf node_modules/ bun.lock

# ── Changelog ─────────────────────────────────────────────────────

# Generate changelog from conventional commits
changelog:
    conventional-changelog -p angular -i CHANGELOG.md -s

# ── Release ───────────────────────────────────────────────────────

# Publish to npm (runs build automatically via prepublishOnly)
publish:
    npm publish

# Publish a dry run
publish-dry:
    npm publish --dry-run

# ── Install ───────────────────────────────────────────────────────

# Install dependencies
install:
    bun install

# ── Help ──────────────────────────────────────────────────────────

# List available commands
help:
    @just --list
