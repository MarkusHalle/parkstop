import { useSyncExternalStore } from 'react'

// SPEC 9: PC layout from 900 px, phone layout below.
const query = '(min-width: 900px)'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(query)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useLayout(): 'phone' | 'pc' {
  return useSyncExternalStore(subscribe, () => (window.matchMedia(query).matches ? 'pc' : 'phone'), () => 'phone')
}
