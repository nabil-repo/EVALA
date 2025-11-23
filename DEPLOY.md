# 📦 Getting Your Package ID

The `NEXT_PUBLIC_PACKAGE_ID` is the address of your deployed Move smart contracts on Sui testnet. You get it by publishing the contracts.

## Quick Start (Windows PowerShell)

**Prerequisites:**
- Install Sui CLI first (see below if not installed)
- Have a Sui wallet with testnet tokens

**Run the deploy script:**
```powershell
# From repo root
.\scripts\deploy.ps1
```

This script will:
1. ✅ Check for Sui CLI
2. 🔄 Switch to testnet environment
3. 🔨 Build the Move package (`contracts/`)
4. 🚀 Publish to Sui testnet
5. 📝 **Automatically update** `frontend/.env` with the package ID
6. 📋 Display next steps

The package ID will look like: `0xabc123...def789`

---

## Installing Sui CLI (if needed)

### Option 1: Download Binary (Easiest for Windows)
1. Go to: https://github.com/MystenLabs/sui/releases
2. Download the Windows release (e.g., `sui-windows-x86_64.zip`)
3. Extract to a folder (e.g., `C:\sui\`)
4. Add that folder to your PATH:
   ```powershell
   $env:PATH += ";C:\sui"
   # Make permanent:
   [Environment]::SetEnvironmentVariable("PATH", $env:PATH, "User")
   ```
5. Verify: `sui --version`

### Option 2: Build from Source (requires Rust)
```powershell
cargo install --locked --git https://github.com/MystenLabs/sui sui
```

---

## Configure Sui Client (First Time)

After installing, configure your Sui client:

```powershell
# Initialize
sui client

# Create/switch to testnet
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet

# Get testnet tokens (faucet)
sui client faucet

# Check balance
sui client gas
```

---

## Manual Deployment (alternative)

If you prefer manual steps:

```powershell
cd contracts
sui move build
sui client publish --gas-budget 100000000
```

Look for output like:
```
╭─────────────────────────────────────────────────────────────────────╮
│ Published Objects                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──                                                                │
│  │ PackageID: 0xABCD1234...                  ← THIS IS YOUR ID     │
│  └──                                                                │
╰─────────────────────────────────────────────────────────────────────╯
```

Copy that `PackageID` into `frontend/.env`:
```properties
NEXT_PUBLIC_PACKAGE_ID=0xABCD1234...
```

---

## After Getting Package ID

1. **Start the frontend:**
   ```powershell
   cd frontend
   npm run dev
   ```

2. **Initialize VoteBook** (required for voting):
   - Visit: http://localhost:3000/dashboard
   - Click "Init VoteBook" button
   - Copy the displayed object ID
   - Add to `frontend/.env`:
     ```properties
     NEXT_PUBLIC_VOTEBOOK_ID=0xVOTEBOOK...
     ```

3. **Test the app:**
   - `/upload` — Register content with IPFS
   - `/vote` — Vote on content variants
   - `/dashboard` — View stats and AI summary

4. **OpenRouter AI (optional)**
   - To enable server-side automatic descriptions on upload, set an OpenRouter API key in your environment:
     ```properties
     OPENROUTER_API_KEY=sk-...your-openrouter-key...
     OPENROUTER_MODEL=gpt-4o-mini
     ```
   - The frontend will POST uploaded Walrus blob IDs to `/api/describe`, which calls OpenRouter to generate short descriptions.

---

## Troubleshooting

**"sui is not recognized"**
- Sui CLI not installed or not in PATH. See installation steps above.

**"insufficient gas"**
- Request testnet tokens: `sui client faucet`
- Or visit: https://discord.com/channels/916379725201563759/971488439931392130

**"Build failed"**
- Check Move syntax errors in `contracts/sources/`
- Ensure Sui framework version matches in `Move.toml`

**"Cannot find package ID"**
- The script auto-extracts it from JSON. If it fails, manually copy from terminal output.

---

## Example Workflow

```powershell
# 1. Deploy contracts
.\scripts\deploy.ps1
# Output: NEXT_PUBLIC_PACKAGE_ID=0xabc...

# 2. Start frontend
cd frontend
npm run dev

# 3. Open browser → http://localhost:3000/dashboard
# 4. Click "Init VoteBook" → copy object ID
# 5. Update .env with NEXT_PUBLIC_VOTEBOOK_ID

# 6. Test upload and vote!
```

---

## Resources

- **Sui Docs**: https://docs.sui.io/guides/developer/
- **Testnet Explorer**: https://suiscan.xyz/testnet
- **Discord (faucet)**: https://discord.gg/sui
