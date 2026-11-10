import { useEffect, useState } from 'react'
import { buildShareLink } from '@/lib/share'

/** The public root of the app, resolved once. Links are `${root}#${secret}`. */
export function useShareRoot(): string | null {
  const [root, setRoot] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    buildShareLink('/')
      .then((url) => live && setRoot(url))
      .catch(() => live && setRoot(`${window.location.origin}/`))
    return () => {
      live = false
    }
  }, [])
  return root
}
