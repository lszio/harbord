export interface IpcRequest {
  id: string
  method: string
  params?: unknown
}

export interface IpcResponse {
  id: string
  result?: unknown
  error?: { code: string; message: string }
}

export interface IpcEvent {
  event: string
  data: unknown
}

export const IpcMethod = {
  RegistryList: 'registry.list',
  RegistryGet: 'registry.get',
  RuntimeStart: 'runtime.start',
  RuntimeStop: 'runtime.stop',
  RuntimeInspect: 'runtime.inspect',
  RuntimeGetSpec: 'runtime.get-spec',
  RuntimeLogs: 'runtime.logs',
  EventSubscribe: 'event.subscribe',
  SelfRegister: 'self.register',
  SelfExpose: 'self.expose',
  SelfAlive: 'self.alive',
  ReconcilerStart: 'reconciler.start',
  ReconcilerStop: 'reconciler.stop',
  ReconcilerStatus: 'reconciler.status',
} as const

export type IpcMethod = (typeof IpcMethod)[keyof typeof IpcMethod]

export function encodeMessage(msg: unknown): string {
  return JSON.stringify(msg) + '\n'
}

export function decodeMessage(data: string): unknown {
  return JSON.parse(data)
}

export function createResponse(req: IpcRequest, result: unknown): IpcResponse {
  return { id: req.id, result }
}

export function createError(req: IpcRequest, code: string, message: string): IpcResponse {
  return { id: req.id, error: { code, message } }
}

export function createEvent(event: string, data: unknown): IpcEvent {
  return { event, data }
}
