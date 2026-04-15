import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling yahoo-finance2 (it includes Deno test deps
  // that break webpack). Runs natively in the Node.js API route runtime instead.
  serverExternalPackages: ['yahoo-finance2'],
};

export default nextConfig;
