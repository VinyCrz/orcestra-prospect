import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Docker usa o build standalone; na Netlify o adaptador oficial do Next cuida do empacotamento.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@orcestra/shared'],
  poweredByHeader: false,
};

export default nextConfig;
