"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "zklogin_id_token";
const EPH_KEY_KEY = "zklogin_eph_keypair";
const RANDOMNESS_KEY = "zklogin_randomness";
const MAX_EPOCH_KEY = "zklogin_max_epoch";

export function setZkIdToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearZkIdToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(EPH_KEY_KEY);
  localStorage.removeItem(RANDOMNESS_KEY);
  localStorage.removeItem(MAX_EPOCH_KEY);
}

export function getZkIdToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setEphemeralKeypair(keypair: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EPH_KEY_KEY, keypair);
}

export function getEphemeralKeypair(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(EPH_KEY_KEY);
}

export function setRandomness(randomness: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RANDOMNESS_KEY, randomness);
}

export function getRandomness(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(RANDOMNESS_KEY);
}

export function setMaxEpoch(maxEpoch: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MAX_EPOCH_KEY, maxEpoch.toString());
}

export function getMaxEpoch(): number | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(MAX_EPOCH_KEY);
  return val ? parseInt(val, 10) : null;
}

export function useZkSession() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(getZkIdToken());
    const onStorage = () => setToken(getZkIdToken());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { token, isSignedIn: !!token };
}
