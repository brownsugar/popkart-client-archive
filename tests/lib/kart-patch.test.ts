import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

class MockSocket extends EventEmitter {
  setTimeout(_timeoutMs: number) {
    return this
  }

  connect(_port: number, _host: string, callback?: () => void) {
    callback?.()
    queueMicrotask(() => this.emit('timeout'))
    return this
  }

  destroy() {
    this.emit('close')
    return this
  }
}

vi.mock('node:net', () => ({
  Socket: MockSocket,
}))

describe('kart-patch socket', () => {
  it('should reject when socket times out', async () => {
    const { connectKartSocket } = await import('../../src/lib/kart-patch.js')

    await expect(connectKartSocket('127.0.0.1', 39393)).rejects.toThrow('Connection timeout')
  })
})
