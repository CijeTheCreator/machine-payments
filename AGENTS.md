# AGENTS.md: Developer Agent Operating Instructions

> **Scope Notice:** This document provides strict operational instructions and behavioral guidelines for AI agents working on **building and maintaining this repository** (`machine-machine-payments` / Scaffold-HBAR Agent & Machine Payments). It is **not** the downstream template user guide (which will be generated in `packages/nextjs` or as specified by the bounty).

---

## 1. Core Operating Principles

### 1.1 Strict Focus on the Assigned Task (No Premature "Next Step" Suggestions)
- **Laser Focus on Current Scope:** Execute only what the user has specifically requested in the current prompt. Do not expand the scope, refactor unrelated modules, or preemptively implement future items from [plan.md](file:///root/machine-machine-payments/machine-machine-payments/plan.md).
- **Prohibition on Unsolicited Next Steps:** When concluding a response, **never** suggest, prompt, or nudge the user toward the next step or task (e.g., do *not* write: *"Now let's proceed to step 2"*, *"Should we implement the Vault contract next?"*, or *"Ready for the next task?"*).
- **Concise Reporting:** Report strictly what was completed, what was verified, and any relevant technical observations or questions directly pertaining to the task at hand. Then stop and await user instructions.
- **Verification over Proaction:** Channel any remaining effort into validating the current task against the Mechanical Gates (lints, builds, tests, secrets) rather than rushing forward.

---

## 2. Mechanical Gate Enforcements (Zero-Tolerance)

Every task performed in this repository must maintain strict compliance with Hedera's Stage 1 Mechanical Eligibility Gates defined in [plan.md](file:///root/machine-machine-payments/machine-machine-payments/plan.md). Any change that violates a gate must be corrected immediately before marking the task complete.

### Gate 1: Scaffold Execution Compatibility
- The root and workspace architecture must remain compatible with:
  ```bash
  npm create scaffold-hbar@latest -- --template <org>/<repo>
  ```
- Do not introduce custom installation requirements or non-standard directory structures that break the `create-scaffold-hbar` ingestion pipeline.

### Gate 2: Template Manifest Integrity (`template.json`)
- `template.json` must always exist at the repository root.
- It must strictly conform to the `create-scaffold-hbar` Zod schema (capabilities, defaults, envVars, outro steps).
- Whenever environment variables or dependencies are added, update `template.json` in lockstep.

### Gate 3: Core Documentation
- Keep repository documentation ([README.md](file:///root/machine-machine-payments/machine-machine-payments/README.md) and developer references) consistent with actual implementation.
- Preserve clarity on setup, prerequisite tooling, and architectural decisions.

### Gate 4: Clean Build Pipeline (Zero Warnings, Zero Errors)
- `install`, `lint`, and `build` commands across all workspaces must pass cleanly with **zero warnings and zero errors**.
- Do not bypass TypeScript errors with `any` casting or `@ts-ignore` unless strictly justified and isolated.
- Run linter checks on any package touched before concluding a task.

### Gate 5: Route Liveness (HTTP 200 OK)
- All Next.js routes (e.g., `/`, `/verify`, `/debug`, `/docs`, `/api/*`) must boot cleanly and return HTTP 200 OK without unhandled exceptions or broken server-side rendering.
- No route may crash on missing environment variables; implement sensible fallback/mock states for initial boot.

### Gate 6: Genuine Native Hedera Service Integration
- Native Hedera services (HTS, HCS, HSCS) must be authentically integrated in production execution paths—not hollow stubs or purely mock wrappers.
- Use official Hedera SDKs (`@hashgraph/sdk`), Hedera Agent Kit (`@hashgraph/agent-kit`), and official `@scaffold-hbar-ui/*` packages.

### Gate 7: Verifiable Testnet Artifacts
- All deployed contracts, HCS topics, and transactions must reference verifiable Hedera testnet entities.
- Ensure all entity IDs (e.g., `0.0.X`) and transaction IDs are testnet-compatible and verifiable via public Mirror Node REST APIs (`https://testnet.mirrornode.hedera.com`).

### Gate 8: Zero Committed Secrets (Strict Security Barrier)
- **NEVER** commit private keys, operator keys, mnemonic phrases, API secrets, or `.env` / `.env.local` files to git.
- Always verify that `.gitignore` covers `.env`, `.env.local`, `.env.*.local`, `*.key`, and credentials.
- Before finishing any task, run `git status` to verify no sensitive files or credentials have been staged or created in tracked paths.
- All live keys must be provisioned via user-supplied local environment variables or the zero-config external dispenser flow.

### Gate 9: MIT Open Source Licensing
- The repository must include a valid `LICENSE` file adhering to the MIT License.
- All contributed code must be original or appropriately licensed under compatible open-source terms.

### Gate 10: Environment & Monorepo Runtime
- Target Node.js `>= 20.18.3`.
- Maintain a clean Yarn workspaces monorepo structure with isolated `packages/` (e.g., `packages/hardhat`, `packages/nextjs`).
- Never mix root and package dependencies inappropriately.

### Gate 11: 100% Offline Test Suite
- Every unit test in the test suite must execute and pass **completely offline**.
- Unit tests must not depend on live network connections, external testnet JSON-RPC endpoints, or pre-funded testnet accounts.
- Use mocks, local Hardhat network emulation, or contract stubs for offline test execution.

---

## 3. Standard Development Protocol for Agents

When given a prompt by the user, follow this strict 4-step execution loop:

```
[1. Task Analysis] ──> [2. Targeted Execution] ──> [3. Gate Verification] ──> [4. Objective Report]
 (Strict scope)       (Implement only what's asked)  (Lints/builds/secrets)    (No next-step nudges)
```

1. **Task Analysis:**
   - Identify the exact deliverables requested.
   - Reference relevant sections in [plan.md](file:///root/machine-machine-payments/machine-machine-payments/plan.md) to understand technical requirements, but confine execution strictly to the user's explicit directive.

2. **Targeted Execution:**
   - Modify or create only the necessary files.
   - Adhere to Hedera conventions: Account IDs (`0.0.X`), tinybar / HBAR decimal distinctions ($1\text{ HBAR} = 10^8\text{ tinybar}$), and official Hedera library standards.

3. **Gate & Quality Verification:**
   - Check compilation and linting for touched packages.
   - Run offline tests to ensure zero regressions.
   - Audit git status to prevent accidental commits of keys or `.env` files.

4. **Objective Report:**
   - Summarize the specific changes made.
   - Detail the verification steps performed.
   - Stop. Do not ask or suggest what to do next.

---

## 4. Key Project References

- Master Plan & Requirements: [plan.md](file:///root/machine-machine-payments/machine-machine-payments/plan.md)
- Bounty Reference: [Hedera Scaffold-HBAR Bounty](https://hedera.com/blog/scaffold-hbar-template-bounty/)
- Scaffold-HBAR Repository: [hedera-dev/scaffold-hbar](https://github.com/hedera-dev/scaffold-hbar)
- Create Scaffold-HBAR CLI: [hedera-dev/create-scaffold-hbar](https://github.com/hedera-dev/create-scaffold-hbar)

