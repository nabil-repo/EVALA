"use client";

import Link from 'next/link';
import { ConnectButton } from '@mysten/dapp-kit';
import ZkLoginBanner from './ZkLoginBanner';
import Image from 'next/image';  

export function Navigation() {
  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4">
      <div className="nav-neuro rounded-[24px] py-4 px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="rounded-[14px] flex items-center justify-center glow-purple group-hover:scale-110 transition-transform">
            <Image src="/EVALA_logo.png" alt="Evala Logo" width={50} height={50} />
          </div>
          <span className="font-semibold text-xl gradient-text">Evala</span>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          <Link href="/upload" className="nav-link">
            Upload
          </Link>
          <Link href="/vote" className="nav-link">
            Vote
          </Link>
          <Link href="/manage" className="nav-link">
            Manage
          </Link>
          <Link href="/rewards" className="nav-link">
            Rewards
          </Link>
          <Link href="/dashboard" className="nav-link">
            Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="glow-purple">
            <ConnectButton />
          </div>
          <div className="glow-blue hidden md:block">
            <ZkLoginBanner compact />
          </div>

        </div>
      </div>
    </nav>
  );
}
