// Parse a raw .eml message (RFC822) into a normalized email + attachments,
// using postal-mime (works in the browser, Electron, and Capacitor WebView).

import PostalMime from 'postal-mime'
import type { EmailMessage } from './parseEmail'

export interface ParsedEml extends EmailMessage {
  attachments: { filename: string; mimeType: string; content: ArrayBuffer }[]
}

function toArrayBuffer(content: unknown): ArrayBuffer {
  if (content instanceof ArrayBuffer) return content
  if (typeof content === 'string') return new TextEncoder().encode(content).buffer
  if (content && ArrayBuffer.isView(content as ArrayBufferView)) {
    const v = content as ArrayBufferView
    const copy = new Uint8Array(v.byteLength)
    copy.set(new Uint8Array(v.buffer as ArrayBuffer, v.byteOffset, v.byteLength))
    return copy.buffer
  }
  return new ArrayBuffer(0)
}

export async function parseEml(data: ArrayBuffer | string): Promise<ParsedEml> {
  const email = await PostalMime.parse(data)
  return {
    from: email.from?.address ?? email.from?.name ?? '',
    subject: email.subject ?? '',
    date: email.date ?? undefined,
    text: email.text ?? undefined,
    html: email.html ?? undefined,
    attachments: (email.attachments ?? [])
      .filter((a) => a.content)
      .map((a) => ({ filename: a.filename ?? 'attachment', mimeType: a.mimeType ?? '', content: toArrayBuffer(a.content) })),
  }
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
