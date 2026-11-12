// Hand-off helpers (D15, F-MAIL-1, F-MAIL-2). Browser only. Nothing here sends anything:
// it copies to the clipboard, saves files on the device, or opens the user's mail program.

/** Copies text; Clipboard API first, then a hidden-textarea execCommand fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Keep keyboard / screen-reader focus where it was (review 2.6, finding 5).
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.left = '0'
      ta.style.opacity = '0'
      document.body.append(ta)
      ta.focus()
      ta.select()
      ta.setSelectionRange(0, text.length) // iOS selects nothing with select() alone
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    } finally {
      previous?.focus()
    }
  }
}

/**
 * Puts a PNG on the clipboard; false when the browser cannot (no ClipboardItem, denied).
 * Pass the Promise straight from the tap handler: the ClipboardItem is created at once, so
 * Safari and Firefox still count it as a user gesture while the image is being made.
 */
export async function copyImage(png: Blob | Promise<Blob>): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return true
  } catch {
    return false
  }
}

const SAVE_GAP_MS = 400
const REVOKE_DELAY_MS = 1500

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Downloads the files one at a time, ~400 ms apart, then revokes the object URLs. */
export async function saveFiles(files: { blob: Blob; name: string }[]): Promise<void> {
  const urls: string[] = []
  try {
    for (let i = 0; i < files.length; i++) {
      if (i > 0) await delay(SAVE_GAP_MS)
      const url = URL.createObjectURL(files[i].blob)
      urls.push(url)
      const a = document.createElement('a')
      a.href = url
      a.download = files[i].name
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.append(a)
      a.click()
      a.remove()
    }
  } finally {
    // Revoke later: revoking right after click() can cancel the last download.
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), REVOKE_DELAY_MS)
  }
}

/** Opens the user's mail program with the mailto: link. */
export function openMailto(href: string): void {
  window.location.href = href
}
