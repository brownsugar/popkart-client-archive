import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockActionCore = vi.hoisted(() => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}))

const mockKartPatch = vi.hoisted(() => ({
  connectKartSocket: vi.fn(),
  connectTCGServer: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  setOutput: mockActionCore.setOutput,
  setFailed: mockActionCore.setFailed,
}))

vi.mock('../../src/lib/kart-patch', () => ({
  connectKartSocket: mockKartPatch.connectKartSocket,
  connectTCGServer: mockKartPatch.connectTCGServer,
}))

vi.mock('consola', () => ({
  consola: {
    box: vi.fn(),
    start: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    ready: vi.fn(),
  },
}))

describe('check entrypoint', () => {
  beforeEach(() => {
    vi.resetModules()
    mockActionCore.setFailed.mockReset()
    mockActionCore.setOutput.mockReset()
    mockKartPatch.connectKartSocket.mockReset()
    mockKartPatch.connectTCGServer.mockReset()
  })

  it('should use id from patch info when present', async () => {
    mockKartPatch.connectKartSocket.mockResolvedValue({
      endpoint: 'http://example.com/ABCDEFGHIJKLMNO',
      id: 'ABCDEFGHIJKLMNO',
      version: 999999,
      mode: 'kart',
    })

    await import('../../src/check.js')

    await vi.waitFor(() => {
      expect(mockActionCore.setOutput).toHaveBeenCalledWith('id', 'ABCDEFGHIJKLMNO')
    })
  })

  it('should fall back to parsing id from endpoint when id is empty', async () => {
    mockKartPatch.connectKartSocket.mockResolvedValue({
      endpoint: 'http://example.com/ABCDEFGHIJKLMNO',
      id: '',
      version: 999999,
      mode: 'kart',
    })

    await import('../../src/check.js')

    await vi.waitFor(() => {
      expect(mockActionCore.setOutput).toHaveBeenCalledWith('id', 'ABCDEFGHIJKLMNO')
    })
  })

  it('should output empty id when id is empty and endpoint has no 15-uppercase-letter tail', async () => {
    mockKartPatch.connectKartSocket.mockResolvedValue({
      endpoint: 'http://example.com/no-id-here',
      id: '',
      version: 999999,
      mode: 'kart',
    })

    await import('../../src/check.js')

    await vi.waitFor(() => {
      expect(mockActionCore.setFailed).toHaveBeenCalledTimes(1)
      const error = mockActionCore.setFailed.mock.calls[0][0] as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('Missing fields: id')
    })
  })

  it.each([
    { field: 'endpoint', patchInfo: { endpoint: '', id: 'ABCDEFGHIJKLMNO', version: 999999, mode: 'kart' } },
    { field: 'version', patchInfo: { endpoint: 'http://example.com/ABCDEFGHIJKLMNO', id: 'ABCDEFGHIJKLMNO', version: 0, mode: 'kart' } },
    { field: 'mode', patchInfo: { endpoint: 'http://example.com/ABCDEFGHIJKLMNO', id: 'ABCDEFGHIJKLMNO', version: 999999, mode: '' } },
  ] as const)('should fail when $field is missing', async ({ field, patchInfo }) => {
    mockKartPatch.connectKartSocket.mockResolvedValue(patchInfo)

    await import('../../src/check.js')

    await vi.waitFor(() => {
      expect(mockActionCore.setFailed).toHaveBeenCalledTimes(1)
      const error = mockActionCore.setFailed.mock.calls[0][0] as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain(`Missing fields: ${field}`)
    })
  })
})
