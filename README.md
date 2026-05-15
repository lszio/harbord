# Harbord

**Harbord** is a declarative local runtime supervisor for Node.js applications. It manages long-running processes (services) with automatic reconciliation, health monitoring, and a simple SDK for service discovery and lifecycle management.

It acts as an **Embedded Runtime Control Plane**, allowing multiple clients (like IDE plugins, CLI tools, or background agents) to coordinate and share named runtime services reliably.

## Key Features

- **Declarative Service Management**: Define how your services should run, and Harbord ensures they stay that way.
- **Shared Singleton Runtimes**: Multiple clients can attach to the same named service, enabling cross-instance coordination.
- **Hidden Daemon**: The supervisor daemon starts automatically on first use via the SDK, keeping the interface simple and zero-config.
- **Robust Reconciliation**: Automatically restarts crashed services or services that fail health checks.
- **Metadata Discovery**: Services can expose dynamic data (like ports or capabilities) which clients can discover via the SDK.
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

// Define and start a service (or attach if already running)
const svc = await harbor.service('my-api', {
  entry: './dist/server.js',
  args: ['--port', '3000'],
  env: { NODE_ENV: 'production' }
});

console.log(`Service status: ${svc.state?.status}`);

// Wait for the service to expose its dynamic port
while (!svc.meta?.port) {
  await new Promise(r => setTimeout(r, 500));
  await svc.refresh();
}
console.log(`Service is listening on port ${svc.meta.port}`);
```

## Self-Registration (for Worker Processes)

If your process is running *inside* Harbord, it can identify itself and send heartbeats.

```typescript
import { Harbor } from 'harbord';

const harbor = new Harbor();
const self = await harbor.self('worker-id');

// Expose metadata (e.g., ports, version)
await self.expose({ port: 3000, protocol: 'http' });

// Send heartbeats to indicate health
setInterval(() => self.alive(), 5000);

// Graceful shutdown notification
process.on('SIGTERM', async () => {
  await self.shutdown();
  process.exit(0);
});
```

## Examples & Scenarios

Check out the `examples/` directory for complete, standalone project examples including:

1. **IDE Plugin Backend**: Shared Language Server between multiple IDE instances.
2. **Dynamic MCP Servers**: Managing and discovering multiple Model Context Protocol servers.
3. **Microservice Dashboard**: Health monitoring with heartbeats and status aggregation.
4. **Multi-Instance Bootstrap**: Robust handling of concurrent daemon startup.

Each example includes its own E2E tests and demonstrates real-world usage patterns.

## CLI Usage

While the SDK handles the daemon automatically, you can also interact via the CLI.

```bash
# Start the daemon manually
harbord --daemon

# Check status of the daemon and all services
harbord status

# List all known runtimes
harbord list
```

## Development

```bash
# Install dependencies
bun install

# Build the project (generates ESM, CJS, and Types)
bun run build

# Run E2E and integration tests
bun run test:e2e
```

## License

MIT
