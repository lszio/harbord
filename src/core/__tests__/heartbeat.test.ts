import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { HeartbeatTracker } from '../heartbeat'

describe('HeartbeatTracker', () => {
  let tracker: HeartbeatTracker

  beforeEach(() => {
    vi.useFakeTimers()
    tracker = new HeartbeatTracker(1000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should be expired for unknown runtime', () => {
    expect(tracker.isExpired('unknown')).toBe(true)
  })

  it('should not be expired after a recent beat', () => {
    tracker.beat('svc')
    expect(tracker.isExpired('svc')).toBe(false)
  })

  it('should be expired after timeout passes', () => {
    tracker.beat('svc')
    vi.advanceTimersByTime(1001)
    expect(tracker.isExpired('svc')).toBe(true)
  })

  it('should clear tracking for a runtime', () => {
    tracker.beat('svc')
    tracker.clear('svc')
    expect(tracker.isExpired('svc')).toBe(true)
  })

  it('should list alive runtimes', () => {
    tracker.beat('svc-a')
    vi.advanceTimersByTime(500)
    tracker.beat('svc-b')
    vi.advanceTimersByTime(600) // svc-a expired, svc-b still alive

    expect(tracker.getAliveIds()).toEqual(['svc-b'])
  })

  it('should purge expired heartbeats', () => {
    tracker.beat('svc-a')
    vi.advanceTimersByTime(500)
    tracker.beat('svc-b')
    vi.advanceTimersByTime(600) // svc-a expired, svc-b alive

    const expired = tracker.purgeExpired()
    expect(expired).toEqual(['svc-a'])
    expect(tracker.getAliveIds()).toEqual(['svc-b'])
  })

  it('should reset expiry on new beat', () => {
    tracker.beat('svc')
    vi.advanceTimersByTime(900)
    expect(tracker.isExpired('svc')).toBe(false)

    tracker.beat('svc') // refresh
    vi.advanceTimersByTime(900)
    expect(tracker.isExpired('svc')).toBe(false)

    vi.advanceTimersByTime(200)
    expect(tracker.isExpired('svc')).toBe(true)
  })
})
