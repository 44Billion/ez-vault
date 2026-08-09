// Dev orchestrator: runs the esbuild watcher (src/ -> docs/) and the static
// server (server.py) together, so `npm start` gives a working dev environment
// in one command. Ctrl+C stops both children.
//
// start:peer intentionally does NOT run its own watcher — it serves the same
// docs/ the main watcher is already rebuilding, just on a second port.
import { spawn } from 'node:child_process'

const port = process.env.PORT || '4000'
const children = []
let serverStarted = false

function shutdown () {
  for (const child of children) {
    try { child.kill('SIGTERM') } catch { /* already gone */ }
  }
}

const watcher = spawn(process.execPath, ['bin/build.js', '--watch'], {
  env: { ...process.env, EZ_VAULT_DEV: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})
children.push(watcher)
watcher.stdout.on('data', chunk => process.stdout.write(chunk))
watcher.stderr.on('data', chunk => process.stderr.write(chunk))
watcher.on('exit', code => {
  shutdown()
  process.exit(code ?? 0)
})

// Start the server once the watcher's initial build finishes (build.js prints
// "watching" only after the first build completes).
function maybeStartServer (chunk) {
  if (serverStarted || !chunk.toString().includes('watching')) return
  serverStarted = true
  const server = spawn('python3', ['server.py'], {
    env: { ...process.env, EZ_VAULT_SERVE_DIR: '.dev' },
    stdio: 'inherit'
  })
  children.push(server)
  server.on('exit', (code, _signal) => {
    if (code !== 0 && code !== null) {
      console.error(`> server.py exited (${code}) — is port ${port} already in use? Run "npm run end" to stop stale servers.`)
    }
    shutdown()
    process.exit(code ?? 0)
  })
}
watcher.stdout.on('data', maybeStartServer)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nStopping watcher and dev server...')
    shutdown()
    process.exit(0)
  })
}

console.log(`> EZ Vault dev — open http://localhost:${port}/`)
console.log('> Peer (second device/port): "npm run start:peer" → http://localhost:4001/')
console.log('> Service worker and update banner are disabled in dev (IS_DEVELOPMENT).')
