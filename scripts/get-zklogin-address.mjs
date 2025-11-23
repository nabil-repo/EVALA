#!/usr/bin/env node

/**
 * Compute zkLogin address for whitelisting
 * 
 * This script computes the zkLogin address that would be generated
 * when a user signs in with Google OAuth using the configured client ID.
 * 
 * The address depends on:
 * 1. JWT token (specifically the 'sub' claim - Google user ID)
 * 2. Salt (deterministic from JWT or from salt service)
 * 
 * For whitelisting purposes, you typically need to provide:
 * - The OAuth client ID
 * - A sample zkLogin address (computed from a test login)
 */

import { jwtToAddress } from '@mysten/sui/zklogin';
import crypto from 'crypto';

// Sample JWT payload structure from Google OAuth
// You'll need to replace the 'sub' value with an actual Google user ID
const sampleJwtPayload = {
    iss: 'https://accounts.google.com',
    azp: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '947318989201-5nkhq1u1sffs38uhj9u2xhp42q7t5qth.apps.googleusercontent.com',
    aud: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '947318989201-5nkhq1u1sffs38uhj9u2xhp42q7t5qth.apps.googleusercontent.com',
    sub: '123456789012345678901', // Replace with actual Google user ID
    email: 'test@example.com',
    email_verified: true,
    nonce: 'dummy_nonce_for_address_computation',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
};

// Create a sample JWT (header.payload.signature format)
const header = { alg: 'RS256', typ: 'JWT', kid: 'test' };
const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
const payloadB64 = Buffer.from(JSON.stringify(sampleJwtPayload)).toString('base64url');
const signatureB64 = 'dummy_signature'; // Signature doesn't matter for address computation
const sampleJwt = `${headerB64}.${payloadB64}.${signatureB64}`;

// Compute deterministic salt from JWT (dev fallback method)
async function computeSalt(jwt) {
    const enc = new TextEncoder().encode(jwt);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    // Convert hex to decimal string and ensure it's within BN254 field
    const BN254_FIELD_SIZE = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    const saltBigInt = BigInt('0x' + hex) % BN254_FIELD_SIZE;
    return saltBigInt.toString(10);
}

async function main() {
    console.log('\n📍 zkLogin Address Computation\n');
    console.log('OAuth Client ID:', sampleJwtPayload.aud);
    console.log('Sample JWT payload:', JSON.stringify(sampleJwtPayload, null, 2));
    
    const salt = await computeSalt(sampleJwt);
    console.log('\nComputed Salt:', salt);
    
    try {
        const zkAddress = jwtToAddress(sampleJwt, salt);
        console.log('\n✅ zkLogin Address:', zkAddress);
        console.log('\n📝 For Whitelisting:');
        console.log('   Client ID:', sampleJwtPayload.aud);
        console.log('   Sample Address:', zkAddress);
        console.log('\n⚠️  Note: The actual address will vary per user (based on their Google "sub" claim)');
        console.log('   This is a sample address computed with a dummy user ID.');
        console.log('\n💡 To get your actual address:');
        console.log('   1. Sign in with Google on the app');
        console.log('   2. Check browser console for the computed zkLogin address');
        console.log('   3. Or add logging in frontend/lib/zkloginExec.ts at zkLoginAddress() function');
    } catch (error) {
        console.error('\n❌ Error computing address:', error.message);
    }
}

main().catch(console.error);
