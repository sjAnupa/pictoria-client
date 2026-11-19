import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteAdminBook,
  fetchAdminBooks,
  fetchAdminDashboard,
  fetchCatalogStats,
  updateAdminBookStatus,
} from '../services/adminBookService'
import { mapApiBookToAdminRow, toggleAdminStatusApi, type AdminBookRow } from '../utils/mapAdminBook'
import type { BookStatus } from '../types/book.types'

const ADMIN_BOOKS_KEY = ['admin', 'books'] as const

export function useCatalogStats() {
  return useQuery({
    queryKey: ['catalog', 'stats'],
    queryFn: fetchCatalogStats,
  })
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: fetchAdminDashboard,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (previous) => previous,
  })
}

export function useAdminBooks() {
  return useQuery({
    queryKey: ADMIN_BOOKS_KEY,
    queryFn: async () => {
      const books = await fetchAdminBooks()
      return books.map(mapApiBookToAdminRow)
    },
    staleTime: 30_000,
  })
}

export function useAdminBookMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_BOOKS_KEY })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
  }

  const patchRows = (update: (rows: AdminBookRow[]) => AdminBookRow[]) => {
    const previous = queryClient.getQueryData<AdminBookRow[]>(ADMIN_BOOKS_KEY)
    if (previous) queryClient.setQueryData(ADMIN_BOOKS_KEY, update(previous))
    return { previous }
  }

  const rollback = (_err: unknown, _vars: unknown, context?: { previous?: AdminBookRow[] }) => {
    if (context?.previous) queryClient.setQueryData(ADMIN_BOOKS_KEY, context.previous)
  }

  const toggleStatus = useMutation({
    mutationFn: ({ bookId, currentStatus }: { bookId: string; currentStatus: BookStatus }) =>
      updateAdminBookStatus(bookId, toggleAdminStatusApi(currentStatus)),
    onMutate: async ({ bookId, currentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ADMIN_BOOKS_KEY })
      const next: BookStatus = toggleAdminStatusApi(currentStatus) === 'published' ? 'Published' : 'Hidden'
      return patchRows((rows) => rows.map((row) => (row.id === bookId ? { ...row, status: next } : row)))
    },
    onError: rollback,
    onSettled: invalidate,
  })

  const remove = useMutation({
    mutationFn: (bookId: string) => deleteAdminBook(bookId),
    onMutate: async (bookId) => {
      await queryClient.cancelQueries({ queryKey: ADMIN_BOOKS_KEY })
      return patchRows((rows) => rows.filter((row) => row.id !== bookId))
    },
    onError: rollback,
    onSettled: invalidate,
  })

  return { toggleStatus, remove }
}

export function useAdminBookCount() {
  const { data } = useAdminBooks()
  return data?.length ?? 0
}
