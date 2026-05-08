# harbord — Claude Development Guide

> Declarative Local Runtime Supervisor for Node.js Applications

---

# 1. 项目定位

harbord 不是：

* pm2 clone
* node child_process wrapper
* process manager
* daemon utility

harbord 的真正定位是：

# Declarative Local Runtime Supervisor

或者：

# Embedded Runtime Control Plane

其核心职责是：

```text
维护“声明的运行状态”与“实际运行状态”的一致性
```

而不是：

```text
调用 spawn() 启动进程
```

---

# 2. 核心设计思想

harbord 的设计遵循：

* SICP
* Declarative Runtime
* Control Plane / Data Plane 分离
* Condition System
* Reconciliation Loop
* Capability-Based Design

系统核心不是：

```text
process
```

而是：

```text
runtime entity
```

Supervisor 不关心：

```text
如何运行
```

只关心：

```text
声明是否成立
```

---

# 3. 核心问题

在以下场景中：

* VSCode 插件
* Theia 插件
* Electron
* AI IDE
* MCP Runtime
* Agent Runtime

会出现：

* 多客户端重复启动服务
* 插件 host reload
* daemon 生命周期耦合
* 端口冲突
* 状态无法共享
* 后台进程无法发现
* 插件卸载后残留进程

harbord 的目标：

```text
让多个客户端共享同一个命名运行时服务
```

例如：

```text
theia-api-bridge
```

无论多少 backend 进程：

```text
全部连接到同一个 runtime service
```

---

# 4. 核心架构

```text
Client SDK
    ↓
Harbord Daemon
    ↓
Runtime Registry
    ↓
Reconciler
    ↓
Runtime Backend
    ↓
Runtime Service
```

---

# 5. 架构层次

# 5.1 SDK Layer

负责：

* connect-or-bootstrap
* runtime discovery
* service negotiation
* state observe

SDK 不直接管理 process。

SDK 只与：

```text
runtime object
```

交互。

---

# 5.2 Harbord Daemon

唯一后台 runtime。

负责：

* registry
* supervision
* reconcile
* metadata aggregation
* lifecycle management
* event stream

Daemon 本身不负责业务逻辑。

---

# 5.3 Reconciler

系统核心。

持续执行：

```text
observe
→ compare
→ reconcile
→ stabilize
```

即：

```text
desired state
vs
actual state
```

---

# 5.4 Runtime Backend

真正的执行层。

例如：

* node-process
* systemd
* launchd
* docker（未来）
* remote（未来）

Supervisor 永远不直接操作 process。

Supervisor 只操作 backend abstraction。

---

# 6. Runtime Backend 抽象

```ts
interface RuntimeBackend {
  ensure(spec: RuntimeSpec): Promise<void>

  stop(id: string): Promise<void>

  remove(id: string): Promise<void>

  inspect(id: string): Promise<RuntimeState>

  logs(id: string): AsyncIterable<RuntimeEvent>
}
```

---

# 7. 第一版 Backend

第一版只实现：

# NodeProcessBackend

内部使用：

```ts
child_process.spawn
```

但：

# Backend abstraction 必须第一天存在。

因为未来需要：

* systemd
* launchd
* docker
* remote runtime

---

# 8. RuntimeSpec

RuntimeSpec 是：

# Desired State

而不是运行结果。

```ts
interface RuntimeSpec {
  id: string

  revision?: string

  entry?: string

  args?: string[]

  env?: Record<string, string>

  singleton?: boolean

  backend?: {
    type: string
  }

  owner?: {
    type: string
    id: string
  }

  conditions?: RuntimeCondition[]
}
```

---

# 9. RuntimeState

RuntimeState 是：

# Actual State

```ts
interface RuntimeState {
  status:
    | 'idle'
    | 'starting'
    | 'running'
    | 'unhealthy'
    | 'stopping'
    | 'stopped'
    | 'crashed'

  pid?: number

  startedAt?: number

  metadata?: Record<string, unknown>
}
```

---

# 10. Metadata 设计

harbord 不负责：

* 业务端口
* HTTP 协议
* RPC 协议
* 业务通信

这些属于：

# Service 自身

例如：

```ts
const app = new Hono()
```

Service 启动后：

```ts
self.expose({
  port: 39123,
  protocol: 'http'
})
```

Metadata 属于：

# RuntimeState

而不是 RuntimeSpec。

---

# 11. Runtime Event Stream

系统必须统一事件模型。

```ts
interface RuntimeEvent {
  type: string

  source: string

  timestamp: number

  payload?: unknown
}
```

事件包括：

* runtime.started
* runtime.stopped
* runtime.crashed
* runtime.log
* runtime.metadata.updated
* runtime.condition.failed

---

# 12. Runtime Conditions

Conditions 是系统核心扩展点。

例如：

```ts
conditions: [
  pluginInstalled('/plugins/bridge')
]
```

reconcile：

```text
condition false
→ stop runtime
→ cleanup
```

---

# 13. Ownership Model

每个 runtime spec 必须可追踪 owner。

例如：

```ts
owner: {
  type: 'plugin',
  id: 'theia-bridge'
}
```

用于：

* 插件卸载检测
* 自动 cleanup
* runtime 生命周期绑定

---

# 14. Runtime Negotiation

这是 harbord 的核心特性之一。

service() 不是简单 lookup。

而是：

# Runtime Negotiation

例如：

```ts
const bridge = await harbor.service(
  'theia-api-bridge',
  spec
)
```

runtime 内可能：

* 不存在 service
* 已存在相同 spec
* 已存在不同 spec

因此：

# 冲突是正常状态

不是异常。

---

# 15. Conflict Recovery Model

受到 Common Lisp Condition System 启发。

不要：

```ts
throw Error()
```

而是：

# 返回可恢复状态

例如：

```ts
if (bridge.conflicted) {
  await bridge.replace()
}
```

恢复策略包括：

* attach()
* replace()
* ignore()
* fork()（未来）

---

# 16. SDK API 设计原则

# 不使用 manager/controller 风格 API

避免：

```ts
runtime.start(id)
runtime.getLogs(id)
runtime.getStatus(id)
```

应该：

# 面向 Runtime Object

---

# 17. 最终 API 风格

```ts
const bridge = await harbor.service(
  'theia-api-bridge',
  {
    entry: bridgePath,
    singleton: true
  }
)
```

---

# 18. RuntimeServiceProxy

service() 返回：

# Live Runtime Object

例如：

```ts
bridge.state
bridge.pid
bridge.meta
bridge.logs
```

行为：

```ts
await bridge.up()
await bridge.down()
await bridge.reload()
```

---

# 19. Worker Self API

Service 内部：

```ts
const self = await harbor.self()
```

然后：

```ts
self.expose({
  port: 39123
})
```

以及：

```ts
self.alive()
```

---

# 20. Bootstrap Flow

SDK 必须自动保证 harbord daemon 存在。

流程：

```text
connect socket
→ fail
→ acquire startup lock
→ spawn daemon
→ wait ready
→ reconnect
```

---

# 21. Runtime Endpoint

Control Plane 使用：

# Unix Socket / Named Pipe

例如：

macOS/Linux:

```text
~/.harbord/runtime.sock
```

Windows:

```text
\\.\pipe\harbord
```

---

# 22. Registry

建议：

```text
~/.harbord/
```

内部：

```text
runtime.sock
bootstrap.lock
services/
state/
logs/
```

---

# 23. Service Discovery

SDK：

```ts
const bridge = await harbor.service(
  'theia-api-bridge'
)
```

拿到：

```ts
bridge.pid
bridge.state
bridge.meta
```

---

# 24. Singleton Runtime

默认：

# 命名 singleton service

例如：

```text
theia-api-bridge
```

多个客户端：

```text
attach to same runtime
```

---

# 25. Systemd Adapter

harbord 不替代 systemd。

而是：

# 协调 systemd

例如：

```ts
backend: {
  type: 'systemd'
}
```

内部：

* systemctl start
* systemctl stop
* journalctl
* unit generation

---

# 26. 第一版 MVP

只实现：

* harbord daemon
* node-process backend
* singleton runtime
* registry
* reconcile loop
* runtime object api
* conflict negotiation
* metadata expose
* event stream
* bootstrap lock
* logs capture

不要实现：

* cluster
* distributed runtime
* container orchestration
* DAG scheduling
* plugin system
* web ui

---

# 27. 推荐目录结构

```text
src/
  core/
    runtime-spec.ts
    runtime-state.ts
    runtime-event.ts
    reconciler.ts

  daemon/
    daemon.ts
    registry.ts
    bootstrap.ts

  backend/
    runtime-backend.ts
    node-process-backend.ts
    systemd-backend.ts

  ipc/
    socket-server.ts
    socket-client.ts
    protocol.ts

  runtime/
    runtime-service.ts
    runtime-service-proxy.ts

  sdk/
    harbor.ts
    self.ts
```

---

# 28. Reconcile Loop

整个系统的灵魂：

```ts
while (true) {
  observe()

  reconcile()

  stabilize()
}
```

Supervisor 的本质：

```text
让现实收敛到声明
```

---

# 29. 最终架构定位

harbord 是：

# Local Runtime Control Plane

而不是：

# Process Manager

它管理的是：

# 命名运行实体

而不是：

# child_process

---

# 30. 设计原则（必须遵守）

# 30.1 Declarative First

永远优先：

```text
desired state
```

而不是：

```text
imperative lifecycle
```

---

# 30.2 Runtime Object First

永远返回：

```text
runtime object
```

而不是：

```text
manager functions
```

---

# 30.3 Backend Abstraction First

Supervisor 永远不直接操作 process。

---

# 30.4 Metadata 与 Spec 分离

Spec：

```text
声明
```

Metadata：

```text
运行态
```

---

# 30.5 Conflict Is Normal

runtime conflict 是正常状态。

必须支持：

# recoverable negotiation

---

# 30.6 Service Is Alive Object

service() 返回：

# live runtime proxy

不是静态数据。

---

# 31. 推荐开发顺序

# Phase 1

* bootstrap
* daemon
* registry
* socket transport

---

# Phase 2

* node-process backend
* runtime object api
* metadata expose

---

# Phase 3

* reconcile loop
* conditions
* ownership cleanup

---

# Phase 4

* conflict negotiation
* recover actions

---

# Phase 5

* systemd backend
* launchd backend

---

# 32. 最终目标

harbord 最终应成为：

# 本地 Runtime Supervisor 基础设施

适用于：

* Theia
* VSCode
* Electron
* AI IDE
* MCP Runtime
* Agent Runtime
* Local AI Services

并成为： 本地 Runtime 的统一控制平面

# 33: 开发相关
项目是一个node包，src中包含所有源码，使用bun管理依赖和构建产物，包含一个cli和sdk；

项目开发过程中需要同时完善文档 ，测试（单元测试和集成测试）和代码实现；