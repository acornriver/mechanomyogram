import { spawn } from 'child_process';

console.log('======================================================');
console.log('🚀 Starting XTH-MMG System (Vite Dev Server + OSC Bridge)');
console.log('======================================================\n');

// Start OSC Bridge
const oscBridge = spawn('node', ['scripts/osc-bridge.js'], {
  stdio: 'inherit',
  shell: true
});

// Start Vite Dev Server
const vite = spawn('npx', ['vite', '--host'], {
  stdio: 'inherit',
  shell: true
});

const cleanup = () => {
  console.log('\n🛑 Shutting down XTH-MMG servers...');
  try { oscBridge.kill(); } catch (e) {}
  try { vite.kill(); } catch (e) {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
