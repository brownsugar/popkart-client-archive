/**
 * KartPatchSocket
 * Base on https://github.com/brownsugar/kart-patcher/blob/main/src-electron/lib/kart-patch-socket.ts
 */
import { Socket } from 'node:net'
import { consola } from 'consola'
import BufferManager from './buffer-manager'

export interface KartPatchServerInfo {
  endpoint: string
  id: string
  version: number
}

export default class KartPatchSocket {
  socket: Socket = null

  connect(host: string, port: number) {
    return new Promise<KartPatchServerInfo>((resolve, reject) => {
      consola.info('[KartPatchSocket] Connecting to patch server...')
      this.socket = new Socket()
      // this.socket.setTimeout(10000)
      this.socket.on('data', data => {
        const buffer = Buffer.from(data)
        const reader = new BufferManager(buffer)
        reader.move(0x0A)

        const version = reader.nextShort()
        const endpoint = reader.nextStringAuto()
        this.socket?.destroy()
        resolve({
          endpoint,
          id: endpoint.match(/\/([A-Z]{15})$/)?.[1] || '',
          version,
        })
      })
      this.socket.on('timeout', () => {
        consola.error('[KartPatchSocket] Connection timeout.')
        this.socket?.destroy()
        reject()
      })
      this.socket.on('error', e => {
        consola.error('[KartPatchSocket] Connection error.\n', e)
        this.socket?.destroy()
        reject()
      })
      this.socket.on('close', () => {
        this.socket = null
      })
      this.socket.connect(port, host, () => {
        consola.ready(`[KartPatchSocket] Connected to ${host}:${port}.`)
      })
    })
  }
}
