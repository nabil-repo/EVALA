# Evala on Sui

Monorepo scaffolding for the Evala dApp on Sui.

## Structure
- `contracts/` — Sui Move package with modules:
  - `EvalaContent` — register transferable content sets and emit events
  - `EvalaVote` — shared table of votes with an on-chain counter per variant
  - `EvalaReward` — (stub) reward pool lifecycle and distribution event
  - `EvalaReputation` — soulbound-like reputation object and update hook
- `frontend/` — Next.js + TypeScript + Tailwind with Sui Wallet Kit
  - Pages: `/`, `/upload`, `/vote`, `/dashboard`
  - API: `/api/summarize` uses OpenAI
- `scripts/` — deploy scripts for Move package (PowerShell + Bash)
- `ai/` — placeholder for off-chain automation

## Prereqs
- Sui CLI installed and configured: https://docs.sui.io
- Node.js 18+ and npm

## Build/Run
- Contracts:
  - **Deploy to testnet**: `./scripts/deploy.ps1` (see [DEPLOY.md](DEPLOY.md) for full guide)
  - This auto-updates NEXT_PUBLIC_PACKAGE_ID in frontend/.env
- Frontend:
  - `cd frontend; npm install; Copy-Item .env.example .env; npm run dev`

## Configure
- **Get Package ID**: Run `./scripts/deploy.ps1` (detailed steps in [DEPLOY.md](DEPLOY.md))
- **Init VoteBook**: Visit /dashboard after starting frontend, click "Init VoteBook"
- Set `NEXT_PUBLIC_WEB3_STORAGE_TOKEN` and `OPENAI_API_KEY` in frontend/.env

## Next steps
- Wire upload and vote transactions to call Move entry functions.
- Query on-chain data to populate lists and counts.
- Implement real reward distribution with SUI coins and validator selection.
