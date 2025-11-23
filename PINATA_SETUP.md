# 📌 Pinata IPFS Setup Guide

## 🚀 Quick Setup (5 minutes)

### 1. Create Pinata Account
Go to: https://app.pinata.cloud/register

### 2. Get Your JWT Token
1. Login to Pinata
2. Go to **API Keys** page: https://app.pinata.cloud/developers/api-keys
3. Click **"New Key"**
4. Configure permissions:
   - ✅ **pinFileToIPFS** (required)
   - ✅ **pinJSONToIPFS** (optional)
5. Give it a name (e.g., "Evala Dev")
6. Click **"Create Key"**
7. **Copy the JWT** (you won't see it again!)

### 3. Add to Your .env.local
```bash
NEXT_PUBLIC_PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Restart Dev Server
```bash
# Stop current server (Ctrl+C)
npm run dev
```

---

## ✅ Test Upload

1. Go to: http://localhost:3000/upload
2. Connect your wallet
3. Enter a title
4. Select 1-5 images
5. Click "Upload to IPFS & Register On-Chain"
6. You should see:
   - "Uploading to IPFS via Pinata..."
   - "Stored on IPFS: Qm..."
   - "✅ Registered on-chain!"

---

## 🔗 View Your Files

After upload, files are accessible at:
```
https://gateway.pinata.cloud/ipfs/<YOUR_CID>
```

Or via any IPFS gateway:
```
https://ipfs.io/ipfs/<YOUR_CID>
https://cloudflare-ipfs.com/ipfs/<YOUR_CID>
```

---

## 💡 Free Tier Limits

Pinata Free Plan includes:
- ✅ 1 GB storage
- ✅ Unlimited pinning
- ✅ 100 GB bandwidth/month
- ✅ Perfect for development & testing!

---

## 🆘 Troubleshooting

### Error: "NEXT_PUBLIC_PINATA_JWT not configured"
- Make sure you added the JWT to `.env.local`
- Restart your dev server after adding it

### Error: "Pinata upload failed: 401"
- Your JWT is invalid or expired
- Generate a new API key from Pinata dashboard

### Upload stuck at "Uploading to IPFS..."
- Check browser console for errors
- Verify JWT is correctly copied (no extra spaces)
- Try with a smaller image first (< 1MB)

---

## 📚 Resources

- [Pinata Docs](https://docs.pinata.cloud/)
- [IPFS Basics](https://docs.ipfs.tech/concepts/)
- [Pinata API Reference](https://docs.pinata.cloud/api-pinning/pin-file)
