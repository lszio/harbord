import { describe, it, expect } from 'vitest'
import {
  encodeMessage,
  decodeMessage,
  createResponse,
  createError,
  createEvent,
  IpcMethod,
} from '../protocol'

describe('encodeMessage / decodeMessage', () => {
  it('should encode and decode a message', () => {
    const msg = { id: '1', method: 'registry.list' }
    const encoded = encodeMessage(msg)
    expect(encoded).toBe('{"id":"1","method":"registry.list"}\n')

    const decoded = decodeMessage(encoded.trim())
    expect(decoded).toEqual(msg)
  })

  it('should handle messages with params', () => {
    const msg = { id: '2', method: 'registry.get', params: { id: 'test' } }
    const encoded = encodeMessage(msg)
    const decoded = decodeMessage(encoded.trim())
    expect(decoded).toEqual(msg)
  })

  it('should throw on invalid JSON', () => {
    expect(() => decodeMessage('not json')).toThrow()
  })
})

describe('createResponse', () => {
  it('should create a response with result', () => {
    const req = { id: '1', method: 'registry.list' }
    const response = createResponse(req, ['svc-a', 'svc-b'])
    expect(response).toEqual({ id: '1', result: ['svc-a', 'svc-b'] })
  })
})

describe('createError', () => {
  it('should create an error response', () => {
    const req = { id: '2', method: 'registry.get' }
    const error = createError(req, 'NOT_FOUND', 'Runtime not found')
    expect(error).toEqual({
      id: '2',
      error: { code: 'NOT_FOUND', message: 'Runtime not found' },
    })
  })
})

describe('createEvent', () => {
  it('should create an event message', () => {
    const event = createEvent('runtime.started', { id: 'test' })
    expect(event).toEqual({ event: 'runtime.started', data: { id: 'test' } })
  })
})

describe('IpcMethod', () => {
  it('should have all required methods', () => {
    expect(IpcMethod.RegistryList).toBe('registry.list')
    expect(IpcMethod.RegistryGet).toBe('registry.get')
    expect(IpcMethod.RuntimeStart).toBe('runtime.start')
    expect(IpcMethod.RuntimeStop).toBe('runtime.stop')
    expect(IpcMethod.RuntimeInspect).toBe('runtime.inspect')
    expect(IpcMethod.RuntimeLogs).toBe('runtime.logs')
    expect(IpcMethod.EventSubscribe).toBe('event.subscribe')
  })
})
