import { describe, it, expect, vi } from 'vitest'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveUrl,
  filetimeToUnix,
  generateMd5,
  getArgs,
  formatSize,
  concurrentMap,
  withRetry,
  ungzip,
} from '../../src/lib/utils'

describe('utils', () => {
  describe('resolveUrl', () => {
    it('should resolve url correctly with trailing/leading slashes', () => {
      expect(resolveUrl('path', 'http://base')).toBe('http://base/path')
      expect(resolveUrl('/path', 'http://base/')).toBe('http://base/path')
      expect(resolveUrl('path', 'http://base/')).toBe('http://base/path')
      expect(resolveUrl('', 'http://base/')).toBe('http://base/')
    })
  })

  describe('ungzip', () => {
    it('should extract gzip payload correctly', async () => {
      const gzipPath = resolve(process.cwd(), 'tests', 'fixtures', 'dummy.gz')
      const extractedPath = gzipPath.replace(/\.gz$/i, '')

      try {
        await expect(ungzip(gzipPath)).resolves.toBeUndefined()
        expect(existsSync(extractedPath)).toBe(true)
      } finally {
        if (existsSync(extractedPath))
          unlinkSync(extractedPath)
      }
    })
    it('should reject when the gzip payload is invalid', async () => {
      const invalidGzipPath = resolve(process.cwd(), 'tests', 'fixtures', 'invalid-stream.gz')
      const extractedPath = invalidGzipPath.replace(/\.gz$/i, '')

      try {
        writeFileSync(invalidGzipPath, 'this is not a valid gzip stream')
        await expect(ungzip(invalidGzipPath)).rejects.toThrow()
      } finally {
        if (existsSync(invalidGzipPath))
          unlinkSync(invalidGzipPath)
        if (existsSync(extractedPath))
          unlinkSync(extractedPath)
      }
    })
  })

  describe('generateMd5', () => {
    it('should generate MD5 hash correctly', async () => {
      const path = resolve(process.cwd(), 'tests', 'fixtures', 'dummy.gz')
      const hash = await generateMd5(path)
      expect(hash).toBe('dfa218c13ab435ccf7bd7b7e45fa04ff')
    })
  })

  describe('filetimeToUnix', () => {
    it('should convert Windows FILETIME to Unix timestamp', () => {
      const timestamp = filetimeToUnix(31258792, -924275025)
      expect(timestamp).toBe(1781075672315) // 2026-06-10T15:14:32.315Z
    })
  })

  describe('formatSize', () => {
    it('should format zero bytes as 0 MB by default', () => {
      expect(formatSize(0)).toBe('0 MB')
    })

    it('should format positive MB values without sign by default', () => {
      expect(formatSize(1572864)).toBe('1.50 MB')
    })

    it('should format negative GB values without sign by default', () => {
      expect(formatSize(-(2 * 1024 ** 3))).toBe('2 GB')
    })

    it('should show sign when includeSign is true', () => {
      expect(formatSize(1572864, true)).toBe('+1.50 MB')
      expect(formatSize(-(2 * 1024 ** 3), true)).toBe('-2 GB')
    })
  })

  describe('getArgs', () => {
    it('should parse process arguments', () => {
      const originalArgv = process.argv
      process.argv = ['node', 'script.js', '--endpoint=http://test', '--version=123']

      const args = getArgs()
      expect(args.endpoint).toBe('http://test')
      expect(args.version).toBe('123')

      process.argv = originalArgv
    })
  })

  describe('concurrentMap', () => {
    it('should process items concurrently', async () => {
      const items = [1, 2, 3, 4, 5]
      const results = await concurrentMap(items, async item => item * 2, 2)
      expect(results).toEqual([2, 4, 6, 8, 10])
    })
  })

  describe('withRetry', () => {
    it('should return result if succeeds immediately', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await withRetry(fn, 3, 10)
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry and succeed', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) throw new Error('fail')
        return 'success'
      })
      const result = await withRetry(fn, 3, 10)
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should fail after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      await expect(withRetry(fn, 3, 10)).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(4)
    })
  })
})
