"use client";
import { useCurrentWallet } from "@mysten/dapp-kit";

export function useIsZkLogin(): boolean {
  const { currentWallet } = useCurrentWallet();
  const name = currentWallet?.name?.toLowerCase() || "";
  // Heuristic: wallets exposing zkLogin typically include "zk" in the name
  return name.includes("zk");
}

export function zkLoginGuardMessage(): string {
  return "This app only supports zkLogin accounts. Please connect using zkLogin.";
}
