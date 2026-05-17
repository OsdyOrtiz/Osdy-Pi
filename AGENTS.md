# AGENTS.md

Guidance for AI agents working in this repository.

## TypeScript standards

- Use strict TypeScript. Prefer early errors over implicit behavior.
- Avoid `any`. If the type is unknown, use `unknown` and narrow it explicitly.
- Prefer simple interfaces and readable object shapes.
- Do not abuse generics. Use them only when they remove duplication without hiding intent.
- Avoid traditional `enum` unless there is a clear interoperability reason. Prefer literal unions or `as const` maps.
- Use discriminated unions for state, events, variants, and result types.
- Keep types close to the code that owns them. Extract shared types only when reused.
- Model impossible states as impossible.

## Maintainability

- Write code for the next teammate, not for type-system gymnastics.
- Favor small functions with clear names over clever abstractions.
- Keep runtime behavior obvious from the call site.
- Prefer explicit return types on exported functions and public APIs.
- Validate external input at boundaries before passing it into typed internals.

## Architecture

- Separate commands, services, and presentation/UI code.
- Commands should parse intent and coordinate work.
- Services should contain business logic and be easy to test.
- UI/rendering code should not own business rules.
- Keep side effects at the edges: filesystem, network, process execution, and UI notifications.

## Tooling expectations

- Use ESLint for consistency and unsafe-pattern detection.
- Keep TypeScript strict mode enabled.
- Run typecheck/lint/tests when available before declaring work done.
- Do not silence errors with casts unless the boundary is documented and justified.

## Review rule

If a solution requires complex generics, nested conditional types, or unreadable type tricks, stop and simplify. This project values maintainable strict typing over impressive-looking types.
