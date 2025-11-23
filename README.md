# Evala on Sui

Decentralized human validation engine on the Sui blockchain. Creators upload multiple content variants (e.g. thumbnails). Validators vote. Rewards are distributed to voters who aligned with the winning variant. Reputation is accrued on-chain via a soulbound NFT.

## Repository Structure

| Path | Purpose |
|------|---------|
| `contracts/` | Move modules (`EvalaContent`, `EvalaVote`, `EvalaReward`, `EvalaReputation`, `EvalaPoll`) |
| `frontend/` | Next.js + TypeScript dApp (upload, vote, dashboard, rewards) |
| `scripts/` | Bash & PowerShell deployment + init helpers |
| `ai/` | Off-chain / future AI utilities (e.g. summarization pipeline) |

## Smart Contract Modules

### `EvalaContent`
Registers content sets (title, description, IPFS/Walrus blob IDs). Emits `ContentRegisteredV2` including `file_types` (comma-separated) for fast UI preview. Enforces payload byte limit (<= 200) so only array of CIDs is stored.

### `EvalaVote`
Maintains a shared `VoteBook` for open votes, variant counts, and closure status. `submit_vote` for public votes. Provides helpers: `get_vote_count`, `is_closed`, `get_winning_variant`.

### `EvalaPoll` (private / staked voting)
Supports optional privacy & prediction staking flow (`submit_vote_private`, `stake_prediction_commit`). Integrated selectively from the UI when a poll exists.

### `EvalaReward`
`fund` creates a reward pool (min 0.1 SUI). `distribute_rewards` closes the loop: validates closure, identifies winning variant, splits SUI among correct voters, emits `RewardDistributed`.

### `EvalaReputation`
Soulbound-like `Reputation` object (no transfer API). Users mint once (`mint`). Each rewarded & unclaimed content can be claimed exactly once via `claim_reward_reputation` (+10 points per task). Tracks claimed content IDs in a `Table<object::ID, bool>`. Query helper `is_claimed` used by the dashboard.

## Core Flow

1. Creator uploads 2–5 files (images / mixed media) on `/upload`.
2. Frontend detects file types (extension + magic bytes fallback) and stores types in event (`file_types`). Walrus payload now only includes CID array to stay under Move size limit.
3. Validators visit `/vote`, preview variants inline (custom fullscreen preview via Blob URL injection) and cast votes.
4. Creator closes voting (Manage/Rewards page) then calls `distribute_rewards` to emit `RewardDistributed` and pay correct voters.
5. Voters mint a Reputation NFT if not already owned.
6. Dashboard `/dashboard` shows "Unclaimed tasks" based on `RewardDistributed` events & `is_claimed` checks (now fixed to use local rep ID) → user clicks claim (or automatic claim batch) → reputation increments by +10 per content.

## Frontend Features

- Multi-file upload (max 5 files, 10MB each) with visual validation.
- Magic bytes detection fallback (via `file-type`) for Walrus blobs lacking extensions.
- On-chain event-first file type resolution; fallback to legacy JSON or detection.
- Voting view with dynamic preview per type (image/video/pdf/audio/text/unknown).
- Private vote + staking UI (optional) when a poll exists.
- Dashboard reputation & reward introspection with real-time claim logic.
- Rewards page for pool funding & distribution (creator actions).
- AI summary endpoint `/api/summarize` (aggregates votes → optional model feedback).

## Environment Variables (frontend/.env.local)

| Var | Description |
|-----|-------------|
| `NEXT_PUBLIC_NETWORK` | Target network (devnet) |
| `NEXT_PUBLIC_PACKAGE_ID` | Deployed Move package ID |
| `NEXT_PUBLIC_VOTEBOOK_ID` | Shared VoteBook object ID |
| `NEXT_PUBLIC_UPGRADE_CAP` | Upgrade capability object ID |
| `NEXT_PUBLIC_SUI_RPC_URL` | RPC endpoint |
| `NEXT_PUBLIC_WALRUS_PUBLISHER_URL` | Walrus publisher API |
| `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL` | Walrus aggregator API |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | zkLogin Google client ID |
| `NEXT_PUBLIC_ZK_REDIRECT_URI` | zkLogin redirect URI |
| `NEXT_PUBLIC_ZK_SPONSOR_ADDRESS` | Sponsor address for zkLogin flows |
| `OPENROUTER_API_KEY` | (Optional) model key for AI summarize |
| `OPENROUTER_MODEL` | Selected model identifier |

After deployment, update `NEXT_PUBLIC_PACKAGE_ID` and related object IDs. Scripts attempt to patch automatically.

## Deployment

### Contracts

Linux / macOS:
```bash
./scripts/deploy.sh
```

Windows PowerShell:
```powershell
./scripts/deploy.ps1
```

Output includes: Package ID, VoteBook (if initialized separately), UpgradeCap. Copy values into `frontend/.env.local`.

### VoteBook Init (if not auto-created)
Run the init script or a Move call to create the shared VoteBook object, then set `NEXT_PUBLIC_VOTEBOOK_ID`.

## Claiming Reputation – Troubleshooting

If you see `reputationId=null` logs but an NFT is minted:
1. Wait a few seconds (indexer catch-up).
2. Refresh dashboard; local variable fix avoids stale state.
3. Ensure `NEXT_PUBLIC_PACKAGE_ID` matches the package where you minted.
4. Unclaimed stays `0` until rewards are distributed AND you own the Reputation NFT.

## Scripts

| Script | Purpose |
|--------|---------|
| `deploy.sh` / `deploy.ps1` | Builds & publishes Move package, echoes IDs |
| `init-votebook.ps1` | Creates VoteBook object (legacy path) |

## Development

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Contracts:
```bash
cd contracts
sui move build
```

## Testing Manual Flow

1. Deploy & set env vars.
2. Upload content (observe event file_types).
3. Vote from a second account.
4. Close voting & distribute rewards.
5. Mint Reputation NFT (if new account).
6. Claim reputation → score increments.

## Planned Enhancements

- Automatic reward-triggered reputation mint + auto-claim.
- More robust private poll lifecycle tooling.
- Caching layer for event → file type mapping.
- Bulk analytics & model-assisted "auto-evaluate" winner suggestions.

## Notes

Devnet only – not audited. Do NOT use with real value. Payload sizes constrained; keep IPFS/Walrus metadata minimal. Reputation is soulbound by convention (no transfer calls exposed).

---
For deeper Move details see `contracts/sources/*` and inline comments.
