"use client";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import "@mysten/dapp-kit/dist/index.css";

const RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.devnet.sui.io:443";
const { networkConfig } = createNetworkConfig({
  devnet: { url: RPC_URL }
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="devnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
