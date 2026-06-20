import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setFailed = vi.fn()

vi.mock('@actions/core', () => ({
  setOutput: vi.fn(),
  setFailed,
}))

vi.mock('../../src/core/patcher', () => ({
  getPatchDiff: vi.fn(),
}))

vi.mock('../../src/core/downloader', () => ({
  downloadFullClient: vi.fn(),
  downloadPatchFiles: vi.fn(),
}))

vi.mock('../../src/core/validator', () => ({
  validateClientFiles: vi.fn(),
}))

vi.mock('../../src/core/archiver', () => ({
  archiveClientFiles: vi.fn(),
}))

describe('main entrypoint argument validation', () => {
  let originalArgv: string[]

  beforeEach(() => {
    vi.resetModules()
    setFailed.mockReset()
    originalArgv = [...process.argv]
  })

  afterEach(() => {
    process.argv = originalArgv
  })

  it('should fail when mode is invalid', async () => {
    process.argv = [
      'node',
      'src/main.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=123',
      '--mode=invalid',
    ]

    await import('../../src/main.js')

    await vi.waitFor(() => {
      expect(setFailed).toHaveBeenCalledTimes(1)
      const error = setFailed.mock.calls[0][0] as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('Invalid patch mode: invalid')
    })
  })

  it('should fail when version is not a positive integer', async () => {
    process.argv = [
      'node',
      'src/main.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=NaN',
      '--mode=kart',
    ]

    await import('../../src/main.js')

    await vi.waitFor(() => {
      expect(setFailed).toHaveBeenCalledTimes(1)
      const error = setFailed.mock.calls[0][0] as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('Invalid patch version: NaN')
    })
  })
})
