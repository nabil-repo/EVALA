# Getting Your zkLogin Address for Whitelisting

## What You Need to Whitelist

When whitelisting with Mysten's zkLogin prover, you need to provide:

1. **OAuth Client ID** (already configured in `.env.local`)
   - Current: `947318989201-5nkhq1u1sffs38uhj9u2xhp42q7t5qth.apps.googleusercontent.com`

2. **Your zkLogin Address** (computed from your Google account)
   - This is unique to each user based on their Google "sub" claim (user ID)

## How to Get Your zkLogin Address

### Option 1: Add Console Logging (Recommended)

Add temporary logging to see your address when you sign in:

**In `frontend/lib/zkloginExec.ts`**, find the line:
```typescript
const zkAddress = await zkLoginAddress(jwt, userSalt);
```

Add right after it:
```typescript
console.log('🔐 Your zkLogin Address:', zkAddress);
```

Then:
1. Restart the dev server: `cd frontend && npm run dev`
2. Open the app in browser with DevTools Console open
3. Sign in with Google
4. Your zkLogin address will be logged in the console

### Option 2: Add UI Display

**In `frontend/components/ZkLoginBanner.tsx`**, you can display the address after sign-in by:

1. Computing the address on mount when signed in
2. Showing it in the UI for easy copy-paste

### Option 3: Use the Sample Script

Run the sample script (note: this shows a dummy address):
```bash
cd /home/proton/EVALA
node scripts/get-zklogin-address.mjs
```

**Important:** The script uses a dummy Google user ID, so the address won't match your actual address. It's just for testing the computation logic.

## Mysten Prover Whitelisting Process

Once you have your zkLogin address:

1. **Submit whitelisting request** to Mysten (if using their hosted prover)
   - Provide OAuth Client ID
   - Provide sample zkLogin address
   - Contact: Sui Discord or support channels

2. **Or use test client IDs** (already whitelisted)
   - `947318989201-5nkhq1u1sffs38uhj9u2xhp42q7t5qth.apps.googleusercontent.com` ✅ (currently configured)
   - `643899645729-8cl2cqjrqb4norfj4ls7fx4pxxuzefpn.apps.googleusercontent.com`

## Alternative: Run Local Prover

Instead of whitelisting with Mysten, you can run your own prover:

```bash
cd frontend/app/api/zk/circuits
docker-compose up -d
```

Then update `.env.local`:
```
ZK_PROVER_URL=http://localhost:8001/v1
```

**Note:** Requires zkLogin ceremony files (zkLogin-main.zkey) in `./zklogin-ceremony-contributions/`

## Current Status

✅ Using whitelisted test client ID: `947318989201-5nkhq1u1sffs38uhj9u2xhp42q7t5qth.apps.googleusercontent.com`

This should work out-of-the-box with Mysten's hosted prover. If you still get "audience not supported" errors, the test client ID may have expired - in that case, run local prover or contact Mysten for updated test credentials.
