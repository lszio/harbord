# Harbord

**Harbord** is a declarative local runtime supervisor for Node.js applications. It manages long-running processes (services) with automatic reconciliation, health monitoring, and a simple SDK for service discovery and lifecycle management.

## Key Features

- **Declarative Service Management**: Define how your services should run, and Harbord ensures they stay that way.
- **Hidden Daemon**: The supervisor daemon starts automatically on first use via the SDK, keeping the interface simple and zero-config.
- **Robust Reconciliation**: Automatically restarts crashed services or services that fail health checks.
- **Unified SDK**: Connect, manage services, and handle self-registration with a single, type-safe API.
- **Zero Configuration**: Sensible defaults with an optional `HARBORD_HOME` environment variable for customization.

## Installation

```bash
npm install harbord
```

## Quick Start (SDK)

The Harbord SDK is designed to be as simple as possible. You don't even need to manually start the supervisor daemon.

```typescript
import { Harbor } from 'harbord';

const harbor = new Harbor();

// Accessing the daemon or starting a service automatically bootstraps the daemon
const info = await harbor.daemon.status();
console.log(`Harbord is running (PID: ${info.pid})`);

// Define and start a service
const svc = await harbor.service('my-api', {
  entry: './dist/server.js',
  args: ['--port', '3000'],
  env: { NODE_ENV: 'production' }
});

console.log(`Service status: ${svc.state.status}`);
```

## SDK Interface

### `Harbor` Constructor Options

```typescript
const harbor = new Harbor({
  /** Base directory for state and socket. Defaults to ~/.harbord or $HARBORD_HOME */
  home: '/custom/path',
  /** Whether to automatically start the daemon if not running. Defaults to true. */
  autoBootstrap: true,
  /** Timeout for waiting for the daemon to start (ms). */
  timeout: 5000
});
```

### Managing Services

```typescript
// Start or attach to a service
const svc = await harbor.service('my-service', spec);

// Stop a service
await svc.down();

// Refresh current state from daemon
await svc.refresh();

// Replace with a new spec (if there's a conflict)
if (svc.conflicted) {
  await svc.replace();
}
```

### Self-Registration (for Worker Processes)

If your process is running *inside* Harbord, it can identify itself and send heartbeats.

```typescript
const self = await harbor.self('worker-id');

// Expose metadata (e.g., ports, version)
await self.expose({ port: 8080 });

// Send a heartbeat
await self.alive();

// Graceful shutdown notification
await self.shutdown();
```

## CLI Usage

While the SDK handles the daemon automatically, you can also interact via the CLI.

```bash
# Start the daemon manually
harbord --daemon

# Check status
harbord status

# List runtimes
harbord list
```

## Development

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run E2E tests
bun run test:e2e
```

## License

MIT
