// The kind of public place (utca, tér, köz, sétány …) named by an address or a road name, so
// the authority notice can say "Kerületi kezelésű tér" instead of always "utca".
// Pure: no UI, no network.
import placeKinds from '../data/place-kinds.json'

const WORDS: Readonly<Record<string, string>> = placeKinds.words
const ABBREVIATIONS: Readonly<Record<string, string>> = placeKinds.abbreviations

/**
 * The place-kind noun from a street name or address, e.g. "tér" for "Hősök tere" or
 * "utca" for "Budapest, Pannónia u. 14.". Scans the words from the end, so house numbers,
 * postcodes, "Budapest" and trailing tails such as "szakasza" are skipped; hyphenated names
 * count by their last part ("Margit-sziget"). An abbreviation counts only with its dot.
 * Null when no known kind word appears.
 */
export function placeKind(text: string | null | undefined): string | null {
  if (!text) return null
  const tokens = text.toLowerCase().split(/[\s,()/–-]+/)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i] ?? ''
    const word = token.replace(/[^\p{L}]/gu, '')
    if (!word) continue
    const kind = WORDS[word] ?? (token.endsWith('.') ? ABBREVIATIONS[word] : undefined)
    if (kind) return kind
  }
  return null
}
