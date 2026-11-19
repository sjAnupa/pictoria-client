import type { Page } from '@playwright/test'

export const ADMIN_USER = {
  _id: 'admin-user-1',
  name: 'Admin Tester',
  email: 'admin@example.com',
  is_admin: true,
  is_super_admin: false,
  createdAt: '2024-01-01T00:00:00.000Z',
}

export const READER_USER = {
  _id: 'reader-user-1',
  name: 'Reader Tester',
  email: 'reader@example.com',
  is_admin: false,
  is_super_admin: false,
  createdAt: '2024-01-01T00:00:00.000Z',
}

export const SAMPLE_BOOK = {
  _id: 'book-1',
  title: 'Cherry Blossom Letters',
  slug: 'cherry-blossom-letters',
  author: 'A Author',
  description: 'A short description for testing.',
  coverImageUrl: '/uploads/covers/books/cherry/cover.webp',
  genres: ['Romance'],
  tags: [],
  language: 'English',
  pageCount: 120,
  totalChapters: 3,
  freeChapterLimit: 3,
  accessType: 'free',
  status: 'published',
  featured: true,
  newArrival: false,
  reviewsEnabled: true,
  stats: { totalReads: 10, averageRating: 4.5, totalReviews: 2, totalLikes: 5, totalViews: 20 },
  chapters: [
    { _id: 'ch-1', chapterNumber: 1, title: 'Chapter 1', totalPages: 10 },
    { _id: 'ch-2', chapterNumber: 2, title: 'Chapter 2', totalPages: 12 },
  ],
}

export async function seedAuth(page: Page, user: typeof ADMIN_USER | typeof READER_USER): Promise<void> {
  await page.addInitScript(
    ({ user, token }) => {
      localStorage.setItem('pictoriya_token', token)
      localStorage.setItem('pictoriya_user', JSON.stringify(user))
    },
    { user, token: 'e2e-test-token' },
  )
}

/** Catch-all API mock so the UI never hits a real server during e2e. */
export async function installApiMocks(
  page: Page,
  options: { user?: typeof ADMIN_USER | typeof READER_USER } = {},
): Promise<{ likeBodies: unknown[]; saveBodies: unknown[] }> {
  const likeBodies: unknown[] = []
  const saveBodies: unknown[] = []
  let engagement = { liked: false, saved: false }
  const sessionUser = options.user ?? READER_USER

  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()

    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Success', data }),
      })

    if (path.endsWith('/auth/me') || path.includes('/auth/me')) {
      return json(sessionUser)
    }

    if (path.includes('/health')) {
      return json({ status: 'ok' })
    }

    if (path.includes('/books/catalog-stats')) {
      return json({ bookCount: 1, authorCount: 1, readerCount: 1 })
    }

    if (path.includes('/admin/dashboard')) {
      return json({
        totals: { books: 1, users: 1, totalReads: 0, activeToday: 0, totalViews: 0 },
        dailyReads: [],
        genreDistribution: [],
        mostReadBooks: [],
        mostLikedBooks: [],
        topReaders: [],
      })
    }

    if (path.includes('/books/most-liked')) {
      return json([SAMPLE_BOOK])
    }

    if (path.includes('/books/cherry-blossom-letters') && method === 'GET') {
      return json(SAMPLE_BOOK)
    }

    if (path.includes('/books') && method === 'GET') {
      return json({ books: [SAMPLE_BOOK], pagination: { page: 1, limit: 50, total: 1, pages: 1 } })
    }

    if (path.includes('/engagement/book/') && path.endsWith('/like') && method === 'PUT') {
      const body = req.postDataJSON() as { liked?: boolean } | null
      likeBodies.push(body)
      engagement = { ...engagement, liked: typeof body?.liked === 'boolean' ? body.liked : !engagement.liked }
      return json(engagement)
    }

    if (path.includes('/engagement/book/') && path.endsWith('/save') && method === 'PUT') {
      const body = req.postDataJSON() as { saved?: boolean } | null
      saveBodies.push(body)
      engagement = { ...engagement, saved: typeof body?.saved === 'boolean' ? body.saved : !engagement.saved }
      return json(engagement)
    }

    if (path.includes('/engagement/book/') && method === 'GET') {
      return json(engagement)
    }

    if (path.includes('/engagement/me/saved')) {
      return json([])
    }

    if (path.includes('/progress')) {
      return json(null)
    }

    if (path.includes('/reviews')) {
      return json({ reviews: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 }, summary: null })
    }

    if (path.includes('/views')) {
      return json({ ok: true })
    }

    if (path.includes('/categories')) {
      return json([])
    }

    if (path.includes('/users')) {
      return json({ users: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } })
    }

    return json({})
  })

  // Broken cover URLs should not hang the UI.
  await page.route('**/uploads/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  )

  return { likeBodies, saveBodies }
}
