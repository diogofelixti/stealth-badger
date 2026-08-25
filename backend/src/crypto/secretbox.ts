import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const NONCE = 12
const TAG = 16

export function seal(plain: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('chave-mestra deve ter 32 bytes')

  const nonce = randomBytes(NONCE)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), body])
}

export function open(sealed: Buffer, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('chave-mestra deve ter 32 bytes')
  if (sealed.length < NONCE + TAG) throw new Error('blob cifrado truncado')

  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, NONCE))
  decipher.setAuthTag(sealed.subarray(NONCE, NONCE + TAG))
  return Buffer.concat([
    decipher.update(sealed.subarray(NONCE + TAG)),
    decipher.final(),
  ]).toString('utf8')
}
