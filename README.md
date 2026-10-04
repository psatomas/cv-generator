# CV Generator

An AI-first CV generation system designed to produce evidence-grounded content.

## Local development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality gate

Run the following before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Technology

- TypeScript
- Next.js with the App Router and `src/` directory
- React
- Tailwind CSS
- Node.js

The application currently contains only the delivery foundation. AI orchestration,
candidate and job data, retrieval, document composition, validation, rendering,
and PDF generation are deliberately deferred to later work.
