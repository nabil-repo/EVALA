# 🧠 **Evala on Sui — Copilot Instructions**

## ⚙️ 1. **Smart Contract Development (Move)**

### 🧩 **Base Modules Setup**

**Prompt to Copilot:**

> Write a Move module called `EvalaContent` for the Sui blockchain.
> The module should allow a creator to:
>
> - register a new content set (title, IPFS hash, number of variants)
> - store creator’s address and timestamp
> - emit an event `ContentRegistered`
>
> Use `object` to represent the content set and make it transferable.

---

### 🗳 **Voting Logic**

**Prompt:**

> Create a `EvalaVote` module in Move that lets validators vote on a content set.
>
> - Each vote includes `content_id`, `variant_index`, and `voter_address`.
> - Store votes in a table keyed by `content_id`.
> - Emit `VoteSubmitted` event.
> - Add a function `get_vote_count(content_id, variant_index)` to retrieve current votes.
>
> Optimize for batch updates and small data footprint.

---

### 💰 **Reward Distribution**

**Prompt:**

> Implement a Move module `EvalaReward` that:
>
> - Accepts a pool of SUI tokens funded by the creator.
> - Distributes rewards proportionally based on consensus alignment.
> - Has a function `distribute_rewards(content_id)` that checks votes, finds the winning variant, and pays validators.
> - Includes `RewardDistributed` event.

---

### 🧾 **Reputation System (Soulbound NFT)**

**Prompt:**

> Create a `EvalaReputation` module in Move for minting a non-transferable Reputation NFT.
>
> - Minted when a validator completes their first validated task.
> - Each NFT stores `validator_address`, `score`, and `task_count`.
> - Add a function `update_reputation(validator, delta)` to modify score.
> - Prevent transfer or burn.
> - Emit `ReputationUpdated` event.

---

### 🔐 **Access Control**

**Prompt:**

> Add basic access control checks to Evala modules so that:
>
> - Only the original creator can fund or close a content set.
> - Only validators can vote.
> - Only the system contract can update reputations.
>   Use capabilities and `signer` verification to enforce this.

---

## 💻 2. **Frontend Integration (Next.js + Sui Wallet Kit)**

### 🏗 **Setup**

**Prompt:**

> Create a Next.js app that connects to the Sui blockchain using `@mysten/sui.js` and `@mysten/dapp-kit`.
> Include a wallet connect button and display the user’s SUI balance.
> Setup Tailwind CSS with neumorphism ui with best UI/UX practices and TypeScript.

---

### 🎨 **Content Upload Page**

**Prompt:**

> Build a page `/upload` where a creator can:
>
> - Connect their Sui wallet
> - Upload 3–5 image variations (store on IPFS using web3.storage)
> - Input title and description
> - On submission, call `EvalaContent.register_content()` on-chain

---

### 👥 **Voting Page**

**Prompt:**

> Build a `/vote` page that:
>
> - Lists available content sets from `EvalaContent`
> - Displays images and allows user to pick one
> - On vote, call `EvalaVote.submit_vote(content_id, variant_index)`
> - After voting, show confirmation and reward notification

---

### 💰 **Dashboard Page**

**Prompt:**

> Create a `/dashboard` that shows:
>
> - User’s total validated tasks
> - Reputation score (from NFT metadata)
> - Earned SUI rewards (from reward contract logs)
> - Table of recent content voted on

---

## 🧠 3. **AI Layer Integration (Off-chain)**

**Prompt:**

> Implement an API endpoint `/api/summarize` in Next.js.
> It should:
>
> - Fetch votes from the blockchain via Sui RPC
> - Aggregate the data (e.g., majority vote, standard deviation)
> - Send summary data to OpenAI API to generate feedback text (e.g., “Thumbnail 2 resonates more due to vibrant colors.”)
> - Return the result to frontend for display in the creator dashboard.

---

## 🔄 4. **Automation / Dev Environment**

**Prompt:**

> Add a Foundry-style Sui local dev setup:
>
> - Use `sui move build` and `sui client publish` commands in a `scripts/deploy.sh`.
> - Add test scripts that deploy the contracts, register mock content, simulate votes, and test reward distribution.

---

## 🧱 5. **Optional Enhancements**

**Prompt:**

> Add an AI-powered “auto-evaluate” button that triggers the `/api/summarize` endpoint to automatically choose a winner based on vote consensus + AI confidence score.
> Display a generated summary paragraph in the dashboard using a card UI.

---

## 🪩 6. **Branding & Landing Page**

**Prompt:**

> Generate a modern hero section for Evala using Tailwind CSS:
> Headline: “Decentralized Human Validation Engine on Sui”
> Subtext: “Real people. Real feedback. Real rewards.”
> Add CTA buttons: “Launch App” and “View Docs”
> Include background gradient (purple-blue) and an animated AI globe.

---

## 🧠 **Bonus Prompt (Full System Scaffolding)**

> Scaffold a full-stack dApp for “Evala” on the Sui blockchain with:
>
> - Move smart contracts (`EvalaContent`, `EvalaVote`, `EvalaReward`, `EvalaReputation`)
> - Next.js + TypeScript frontend with wallet connection
> - IPFS upload integration
> - On-chain/off-chain AI summarization
>
> Organize into folders:
>
> ```
> contracts/
> frontend/
> scripts/
> ai/
> ```


# important links
https://docs.sui.io/guides/developer/