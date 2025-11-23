# Evala Frontend (Next.js + Sui Wallet Kit)

This is a minimal Next.js app for Evala with Sui wallet connection, pages for upload, vote, and dashboard, and an AI summary API.

## Quickstart (Windows PowerShell, Sui testnet)

```powershell
cd frontend
npm install
# copy env example
Copy-Item .env.example .env
# edit .env to set NEXT_PUBLIC_SUI_RPC_URL, NEXT_PUBLIC_PACKAGE_ID, tokens
npm run dev

# One-time: initialize VoteBook shared object (copy ID to .env)
cd ..\scripts
./init-votebook.ps1 -PackageId $env:NEXT_PUBLIC_PACKAGE_ID
# Inspect output; set NEXT_PUBLIC_VOTEBOOK_ID in frontend/.env
```

Open http://localhost:3000

## Pages
- `/` landing hero
- `/upload` upload images to Walrus and register on-chain via `EvalaContent.register_content_v2_indexed`
- `/vote` list content and submit votes. Supports:
	- Standard votes via `EvalaVote.submit_vote`
	- Private votes with Walrus proof via `EvalaPoll.submit_vote_private` (shared poll)
	- Optional prediction stake commitment recorded on-chain
- `/dashboard` shows stats and calls `/api/summarize` for AI summary

## Sui integration
- Providers set up with `@mysten/dapp-kit` in `components/Providers.tsx`.
- Configure RPC via `NEXT_PUBLIC_SUI_RPC_URL`. Package/object IDs go in env as well.
- Polls are shared objects created via `EvalaPoll::create_poll`. Creators can create a poll per content from the Vote page.

## Storage & Env
- Walrus Web API:
	- `NEXT_PUBLIC_WALRUS_PUBLISHER_URL` (e.g. `https://publisher.walrus-testnet.walrus.space`)
	- `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL` (e.g. `https://aggregator.walrus-testnet.walrus.space`)
- Package Id: `NEXT_PUBLIC_PACKAGE_ID`
- VoteBook Id (legacy voting): `NEXT_PUBLIC_VOTEBOOK_ID`

## Styling
- TailwindCSS with light neumorphism shadows and a gradient hero.
