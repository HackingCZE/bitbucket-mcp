#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const manifest = {
  name: 'Bitbucket MCP',
  slug: 'bitbucket-mcp',
  version: pkg.version,
  description: `${pkg.description} (hardened read-only by default)`,
  homepage: pkg.homepage,
  repository: pkg.repository?.url?.replace(/^git\+/, '') || null,
  license: pkg.license,
  author: pkg.author,
  keywords: pkg.keywords,
  icon: 'https://bitbucket.org/favicon.ico',
  transport: 'stdio',
  startCommand: {
    command: 'node',
    args: ['dist/index.js']
  },
  configSchema: {
    type: 'object',
    properties: {
      BITBUCKET_URL: {
        type: 'string',
        description: 'Bitbucket API URL (defaults to https://api.bitbucket.org/2.0)',
        default: 'https://api.bitbucket.org/2.0'
      },
      BITBUCKET_TOKEN: {
        type: 'string',
        description: 'Bitbucket access token for authentication. Prefer read-only scope.'
      },
      BITBUCKET_USERNAME: {
        type: 'string',
        description: 'Bitbucket username (used with password authentication)'
      },
      BITBUCKET_PASSWORD: {
        type: 'string',
        description: 'Bitbucket app password/API token (used with username authentication)',
        format: 'password'
      },
      BITBUCKET_WORKSPACE: {
        type: 'string',
        description: 'Default Bitbucket workspace to use when not specified'
      },
      BITBUCKET_ENABLE_WRITE: {
        type: 'string',
        description: 'Explicit opt-in for write operations. Default false/read-only.',
        default: 'false'
      },
      BITBUCKET_ENABLE_DANGEROUS: {
        type: 'string',
        description: 'Second opt-in for destructive delete operations; requires write mode.',
        default: 'false'
      },
      BITBUCKET_PROXY_DEBUG: {
        type: 'string',
        description: 'Enable minimal credential-redacted proxy diagnostics on stderr.',
        default: 'false'
      }
    },
    oneOf: [
      { required: ['BITBUCKET_TOKEN'] },
      { required: ['BITBUCKET_USERNAME', 'BITBUCKET_PASSWORD'] }
    ]
  },
  documentation: {
    guide: 'https://github.com/modelcontextprotocol/registry/blob/main/docs/guides/publishing/publish-server.md',
    setup: 'See README.md for hardened read-only configuration and explicit write opt-in.'
  }
};

const outputDir = path.join(rootDir, 'registry');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'bitbucket-mcp.manifest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Registry manifest updated at ${path.relative(rootDir, outputPath)}`);
