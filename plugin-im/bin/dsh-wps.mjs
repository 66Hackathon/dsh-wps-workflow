#!/usr/bin/env node

import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PACKAGE_NAME = '@66hackathon/dsh-wps';
const DEFAULT_SOURCE = 'github:66Hackathon/dsh-wps-workflow#path:plugin-im';

function usage() {
  console.log(`Usage:
  dsh-wps install [--profile web] [--source <package-spec>]
  dsh-wps uninstall [--profile web]

Examples:
  npx -y github:66Hackathon/dsh-wps-workflow#path:plugin-im install
  dsh-wps install --source .`);
}

function takeOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function runDsh(args) {
  const result = spawnSync('dsh', args, {
    cwd: tmpdir(),
    stdio: 'inherit',
    shell: false,
  });
  if (result.error?.code === 'ENOENT') {
    throw new Error('找不到 dsh，请先安装 DeepSeek Harness 并确保 dsh 在 PATH 中。');
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`dsh 退出，状态码 ${result.status ?? 1}`);
}

const args = process.argv.slice(2);
const command = args.shift();

if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

try {
  const profile = takeOption(args, '--profile', 'web');
  if (command === 'install') {
    const requested = takeOption(args, '--source', DEFAULT_SOURCE);
    const source = requested === '.' || requested === '..'
      || requested.startsWith('./') || requested.startsWith('../')
      ? resolve(process.cwd(), requested)
      : (isAbsolute(requested) ? requested : requested);
    if (args.length > 0) throw new Error(`无法识别的参数：${args.join(' ')}`);
    runDsh(['plugin', '--profile', profile, 'add', '-w', source]);
    console.log(`\n已安装 ${PACKAGE_NAME}。请重启 dsh web / Harness Host，然后在 设置 → WPS 协作 中配置。`);
  } else if (command === 'uninstall') {
    if (args.length > 0) throw new Error(`无法识别的参数：${args.join(' ')}`);
    runDsh(['plugin', '--profile', profile, 'remove', PACKAGE_NAME]);
    console.log(`\n已移除 ${PACKAGE_NAME}。请重启 dsh web / Harness Host。`);
  } else {
    usage();
    process.exit(1);
  }
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
