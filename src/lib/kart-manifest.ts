import { consola } from 'consola'
import { resolveUrl } from './utils'
import { KartPatchFile, TcgPatchFile } from './kart-files'

export const loadKartNfo2 = async (endpoint: string): Promise<KartPatchFile[]> => {
  const url = resolveUrl('files.nfo2', endpoint)
  consola.log('Fetching URL:', url)

  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`[KartManifest][NFO2] Failed to fetch nfo2 file: ${response.status} ${response.statusText}`)

  const data = await response.text()
  if (!data.startsWith('NFO200'))
    throw new Error('[KartManifest][NFO2] Invalid nfo2 file.\n' + data)

  return data
    .trim()
    .split('\r\n')
    .slice(1)
    .map(line => {
      const info = line
        .split(',')
        .map(text => {
          const unquotedText = text.slice(1, -1)
          const value = isNaN(Number(unquotedText))
            ? unquotedText.replace(/\\/g, '/')
            : Number(unquotedText)
          return value
        }) as ConstructorParameters<typeof KartPatchFile>
      return new KartPatchFile(...info)
    })
}

export const loadTcgTxf = async (endpoint: string): Promise<TcgPatchFile[]> => {
  const url = resolveUrl('NT.txf', endpoint)
  consola.log('Fetching URL:', url)

  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`[KartManifest][TXF] Failed to fetch txf file: ${response.status} ${response.statusText}`)

  const data = await response.text()
  if (!data.includes(':\\'))
    throw new Error('[KartManifest][TXF] Invalid txf file.\n' + data)

  return data
    .trim()
    .split('\r\n')
    .map(line => {
      const info = line
        .slice(0, -1) // trailing 'l'
        .split(':')
        .map(text => {
          const value = isNaN(Number(text))
            ? text.replace(/\\/g, '/')
            : Number(text)
          return value
        }) as ConstructorParameters<typeof TcgPatchFile>
      return new TcgPatchFile(...info)
    })
}
