import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { buildFromArchives } from '../../src/core/cache'
import { removeDirectory } from '../../src/lib/utils'
import { resolveArchivesDir } from '../../src/lib/paths'
import { copyFile, mkdir, readdir } from 'node:fs/promises'

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn(),
}))

vi.mock('../../src/lib/utils', async () => {
  const actual = await vi.importActual('../../src/lib/utils')
  return {
    ...actual,
    removeDirectory: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../../src/lib/paths', async () => {
  const actual = await vi.importActual('../../src/lib/paths')
  return {
    ...actual,
    resolveArchivesDir: vi.fn(),
  }
})

describe('core/cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveArchivesDir).mockReturnValue(resolve(process.cwd(), 'archives'))
  })

  it('should return false when archives directory cannot be read', async () => {
    vi.mocked(readdir).mockRejectedValue(new Error('missing archives dir'))

    const result = await buildFromArchives()

    expect(result).toBe(false)
    expect(removeDirectory).not.toHaveBeenCalled()
    expect(mkdir).not.toHaveBeenCalled()
    expect(copyFile).not.toHaveBeenCalled()
  })

  it('should return false when no full client archives are found', async () => {
    vi.mocked(readdir).mockResolvedValue([
      'PopKart_Patch_P3500_01.zip',
      'notes.txt',
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    const result = await buildFromArchives()

    expect(result).toBe(false)
    expect(removeDirectory).not.toHaveBeenCalled()
    expect(mkdir).not.toHaveBeenCalled()
    expect(copyFile).not.toHaveBeenCalled()
  })

  it('should rebuild cache dir and copy full client archives with sequential names', async () => {
    const archivesDir = resolve(process.cwd(), 'archives')
    const cacheDir = resolve(process.cwd(), 'cache')

    vi.mocked(resolveArchivesDir).mockReturnValue(archivesDir)
    vi.mocked(readdir).mockResolvedValue([
      'PopKart_Client_P3500_10.zip',
      'PopKart_Patch_P3500_01.zip',
      'PopKart_Client_P3500_2.zip',
      'PopKart_Client_P3500_1.zip',
    ] as unknown as Awaited<ReturnType<typeof readdir>>)

    const result = await buildFromArchives()

    expect(result).toBe(true)
    expect(removeDirectory).toHaveBeenCalledWith(cacheDir)
    expect(mkdir).toHaveBeenCalledWith(cacheDir, { recursive: true })

    expect(copyFile).toHaveBeenCalledTimes(3)
    expect(copyFile).toHaveBeenNthCalledWith(
      1,
      resolve(archivesDir, 'PopKart_Client_P3500_1.zip'),
      resolve(cacheDir, 'PopKart_Client_1.zip'),
    )
    expect(copyFile).toHaveBeenNthCalledWith(
      2,
      resolve(archivesDir, 'PopKart_Client_P3500_2.zip'),
      resolve(cacheDir, 'PopKart_Client_2.zip'),
    )
    expect(copyFile).toHaveBeenNthCalledWith(
      3,
      resolve(archivesDir, 'PopKart_Client_P3500_10.zip'),
      resolve(cacheDir, 'PopKart_Client_3.zip'),
    )
  })
})
