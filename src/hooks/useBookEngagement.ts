import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { engagementQueryKeys } from '../lib/queryClient'
import { fetchBookEngagement, fetchSavedBooks, setBookLike, setSavedBook } from '../services/engagementService'
import type { BookEngagementState } from '../types/engagement.types'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import { useAuthStore } from '../store/authStore'

export function useBookEngagement(bookId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: bookId ? engagementQueryKeys.book(bookId) : ['engagement', 'book', 'none'],
    enabled: Boolean(bookId) && isAuthenticated,
    queryFn: () => fetchBookEngagement(bookId!),
    staleTime: 30_000,
  })
}

type EngagementFlag = keyof BookEngagementState

/**
 * Optimistic toggle: the UI flips immediately, the server receives the explicit
 * desired value (idempotent), and only the last in-flight response is applied
 * so rapid clicks cannot be overwritten by an out-of-order reply.
 */
function useOptimisticEngagementToggle(
  bookId: string,
  flag: EngagementFlag,
  send: (bookId: string, value: boolean) => Promise<BookEngagementState>,
) {
  const queryClient = useQueryClient()
  const key = engagementQueryKeys.book(bookId)
  const mutationKey = ['engagement', 'set', flag, bookId]

  return useMutation({
    mutationKey,
    mutationFn: (value: boolean) => send(bookId, value),
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<BookEngagementState>(key)
      queryClient.setQueryData<BookEngagementState>(key, {
        liked: previous?.liked ?? false,
        saved: previous?.saved ?? false,
        [flag]: value,
      })
      return { previous }
    },
    onError: (_err, _value, context) => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      if (context?.previous) queryClient.setQueryData(key, context.previous)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onSuccess: (state) => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      queryClient.setQueryData(key, state)
    },
    onSettled: () => {
      if (flag === 'saved') void queryClient.invalidateQueries({ queryKey: engagementQueryKeys.saved })
    },
  })
}

export function useToggleBookLike(bookId: string) {
  const queryClient = useQueryClient()
  const mutation = useOptimisticEngagementToggle(bookId, 'liked', setBookLike)
  return {
    ...mutation,
    toggle: () => {
      const current = queryClient.getQueryData<BookEngagementState>(engagementQueryKeys.book(bookId))
      mutation.mutate(!(current?.liked ?? false))
    },
  }
}

export function useToggleSavedBook(bookId: string) {
  const queryClient = useQueryClient()
  const mutation = useOptimisticEngagementToggle(bookId, 'saved', setSavedBook)
  return {
    ...mutation,
    toggle: () => {
      const current = queryClient.getQueryData<BookEngagementState>(engagementQueryKeys.book(bookId))
      mutation.mutate(!(current?.saved ?? false))
    },
  }
}

export function useSavedBooks() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: engagementQueryKeys.saved,
    enabled: isAuthenticated,
    queryFn: async () => {
      const items = await fetchSavedBooks()
      return items.map((item) => ({
        ...item,
        coverImageUrl: resolveMediaUrl(item.coverImageUrl),
      }))
    },
    staleTime: 15_000,
    refetchOnMount: true,
  })
}
