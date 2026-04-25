import { useCallback } from 'react'
import { isRedirect, useRouter } from '@tanstack/react-router'

export function useServerFn<T extends (...args: any[]) => Promise<any>>(serverFn: T) {
  const router = useRouter()
  return useCallback(async (...args: Parameters<T>) => {
    try {
      const res = await serverFn(...args)
      if (isRedirect(res)) throw res
      return res
    } catch (err: any) {
      if (isRedirect(err)) {
        err.options._fromLocation = router.stores.location.get()
        return router.navigate(router.resolveRedirect(err).options)
      }
      throw err
    }
  }, [router, serverFn]) as (...args: Parameters<T>) => ReturnType<T>
}