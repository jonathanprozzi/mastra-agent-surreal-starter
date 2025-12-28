# Contributing

Thank you for your interest in contributing to the Mastra SurrealDB Starter!

## Project Context

This project serves two purposes:

1. **Starter Template** - A ready-to-use template for building Mastra agents with SurrealDB storage
2. **Reference Implementation** - Demonstrates patterns that could be contributed to Mastra's official stores collection

## How to Contribute

### Bug Reports & Feature Requests

Open an issue describing the bug or feature. Include:
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Your environment (Node version, OS, SurrealDB version)

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test your changes (`bun run scripts/test-surreal.ts`)
5. Commit with a clear message
6. Push and open a Pull Request

### Code Style

- Use TypeScript with strict mode
- Follow existing patterns in the codebase
- Add JSDoc comments for public APIs
- Keep changes focused and minimal

## Mastra PR Path

If you're interested in contributing this adapter to Mastra's official stores collection (`@mastra/surrealdb`), here's what would be needed:

### Current State (This Repo)
- Full starter template with agents, tools, workflows
- SurrealStore + SurrealVector implementations
- Example scripts and Docker setup

### Official Package Requirements
The adapter would need to be restructured to match Mastra's package format:

```
stores/surrealdb/
├── src/
│   ├── index.ts           # Exports SurrealStore, SurrealVector
│   ├── store.ts           # SurrealStore implementation
│   ├── vector.ts          # SurrealVector implementation
│   └── domains/           # Domain classes
├── package.json           # @mastra/surrealdb
├── tsconfig.json
├── tsup.config.ts         # Build configuration
├── vitest.config.ts       # Test configuration
└── README.md
```

### Steps to Contribute to Mastra

1. Review [Mastra's CONTRIBUTING.md](https://github.com/mastra-ai/mastra/blob/main/CONTRIBUTING.md)
2. Open an issue in the Mastra repo discussing the SurrealDB adapter
3. Extract the core adapter code (storage + vector) from this starter
4. Restructure to match their package format
5. Add comprehensive vitest tests
6. Submit PR to the Mastra repo

## Questions?

Feel free to open an issue for any questions about contributing.
