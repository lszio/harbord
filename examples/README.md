# Harbord Examples

This directory contains concrete examples of how to use **Harbord** in different scenarios. These examples are also used as E2E tests to ensure the reliability of the system.

## Scenarios

### 1. IDE Plugin Backend (`ide-plugin/`)
Demonstrates how multiple IDE instances (clients) can share a single "Language Server" service. 
- **Key Feature**: Singleton services and metadata sharing.
- **Workflow**: 
  1. First client starts the service.
  2. Second client attaches to the *same* process.
  3. Second client retrieves the dynamic port and capabilities from metadata.

### 2. Dynamic MCP Servers (`mcp-servers/`)
Shows how to manage multiple distinct services (Model Context Protocol servers) and dynamically discover their connection details.
- **Key Feature**: Named services and dynamic discovery.
- **Workflow**:
  1. A manager script starts several MCP servers (sqlite, weather).
  2. Each server registers itself and exposes its dynamic port.
  3. The manager queries the status and metadata of all running servers.

### 3. Microservice Dashboard (`microservices/`)
A monitoring scenario where multiple workers send heartbeats to the supervisor, and a dashboard monitors their health.
- **Key Feature**: Heartbeats and lifecycle management.
- **Workflow**:
  1. Several workers are started as Harbord services.
  2. Workers periodically call `self.alive()` to report health.
  3. A dashboard monitors the `running` status of all workers.

### 4. Multi-Instance Bootstrap (`multi-instance/`)
Demonstrates how Harbord handles multiple clients attempting to start the daemon at the exact same time.
- **Key Feature**: Atomic bootstrap locking and coordination.
- **Workflow**:
  1. A script launches 5 clients simultaneously.
  2. One client successfully starts the daemon.
  3. The other 4 clients wait for the socket and attach to the shared instance.

## How to Run

Ensure you have built the project first:
```bash
bun run build
```

The examples are set up as standalone sub-packages. You can run them using `bun run` from the root or from their respective directories:

```bash
# IDE Plugin Example
bun run examples/ide-plugin/src/client.ts

# MCP Servers Example
bun run examples/mcp-servers/src/manager.ts

# Microservice Dashboard Example
bun run examples/microservices/src/dashboard.ts

# Multi-Instance Example
bun run examples/multi-instance/src/run-parallel.ts
```

Each example has its own `package.json` and `tsconfig.json`, demonstrating how to use Harbord as a dependency in a real project.

## Development

If you are modifying Harbord and want to see the changes reflected in the examples, make sure to run `bun run build` so that the generated types and bundles are updated. The examples are linked to the root package via `bun link`.

These examples are automatically validated by the integrated E2E test suite:
```bash
bun run test:e2e
```
