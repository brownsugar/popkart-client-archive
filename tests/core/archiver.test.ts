import { describe, it, expect, vi, beforeEach } from 'vitest'
import { archiveClientFiles } from '../../src/core/archiver'
import { removeDirectory } from '../../src/lib/utils'

const zipInstances: { addFile: ReturnType<typeof vi.fn>, archive: ReturnType<typeof vi.fn> }[] = []

vi.mock('zip-lib', () => ({
  Zip: class {
    addFile = vi.fn()
    archive = vi.fn().mockResolvedValue(undefined)

    constructor() {
      zipInstances.push({ addFile: this.addFile, archive: this.archive })
    }
  },
}))

vi.mock('../../src/lib/utils', async () => {
  const actual = await vi.importActual('../../src/lib/utils')
  return {
    ...actual,
    removeDirectory: vi.fn().mockResolvedValue(undefined),
  }
})

describe('core/archiver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    zipInstances.length = 0
  })

  it('should archive both patch and full file groups', async () => {
    const patchPair = {
      localFile: { path: 'client/Data/a.rho' },
      remoteFile: { path: 'Data/a.rho', size: 128 },
    }
    const fullPair = {
      localFile: { path: 'client/Data/b.rho' },
      remoteFile: { path: 'Data/b.rho', size: 256 },
    }

    await archiveClientFiles(
      [fullPair] as unknown as Parameters<typeof archiveClientFiles>[0],
      [patchPair] as unknown as Parameters<typeof archiveClientFiles>[1],
      {
        endpoint: 'http://mock',
        id: 'ID',
        version: 3503,
        mode: 'kart',
      },
    )

    expect(removeDirectory).toHaveBeenCalled()
    expect(zipInstances.length).toBe(2)

    expect(zipInstances[0].addFile).toHaveBeenCalledWith('client/Data/a.rho', 'Data/a.rho')
    expect(zipInstances[1].addFile).toHaveBeenCalledWith('client/Data/b.rho', 'Data/b.rho')

    const patchArchiveArg = zipInstances[0].archive.mock.calls[0][0] as string
    const fullArchiveArg = zipInstances[1].archive.mock.calls[0][0] as string
    expect(patchArchiveArg).toContain('PopKart_Patch_P')
    expect(patchArchiveArg).toContain('_P3503_01.zip')
    expect(fullArchiveArg).toContain('PopKart_Client_P3503_01.zip')
  })

  it('should skip empty archive groups', async () => {
    await archiveClientFiles([], [] as unknown as Parameters<typeof archiveClientFiles>[1], {
      endpoint: 'http://mock',
      id: 'ID',
      version: 3503,
      mode: 'kart',
    })

    expect(zipInstances.length).toBe(0)
    expect(removeDirectory).toHaveBeenCalledTimes(1)
  })
})
