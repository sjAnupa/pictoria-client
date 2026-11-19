import { expect, test, type Page, type Route } from '@playwright/test'
import { ADMIN_USER, installApiMocks, seedAuth } from './helpers'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type Behaviour = {
  /** Batch page-upload route: works, is missing (old server) or fails with 500. */
  upload: 'ok' | 'missing' | 'fail'
  /** First POST /chapters: succeed, fail before saving, or save but lose the response. */
  firstChapter: 'ok' | 'fail' | 'lose-response'
}

type Backend = {
  bookPosts: number
  bookPuts: number
  uploadPosts: number
  chapterPosts: number
  chapterPuts: number
  chapterManifests: Array<Array<{ type: string }>>
  books: Array<{ _id: string; title: string }>
  chapters: Array<{ _id: string; bookId: string; chapterNumber: number; title: string; pageImageUrls: string[] }>
}

/** Stateful fake of the admin book/chapter endpoints (registered after the generic mocks). */
async function installBookBackend(page: Page, behaviour: Behaviour): Promise<Backend> {
  const backend: Backend = {
    bookPosts: 0,
    bookPuts: 0,
    uploadPosts: 0,
    chapterPosts: 0,
    chapterPuts: 0,
    chapterManifests: [],
    books: [],
    chapters: [],
  }
  let nextId = 1

  const ok = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'ok', data }),
    })
  const fail = (route: Route, status: number, message: string) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message }),
    })

  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const { pathname, searchParams } = new URL(req.url())
    const method = req.method()
    const path = pathname.replace(/^.*\/api/, '')

    if (path === '/categories' && method === 'GET') {
      const type = searchParams.get('type')
      return ok(
        route,
        type === 'genre'
          ? [
              {
                _id: 'g1',
                name: 'Romance',
                slug: 'romance',
                type: 'genre',
                isActive: true,
                createdAt: '2024-01-01',
              },
            ]
          : [],
      )
    }

    if (path === '/books' && method === 'POST') {
      backend.bookPosts += 1
      const book = { _id: `book-${nextId++}`, title: 'E2E Book' }
      backend.books.push(book)
      return ok(route, { ...book, slug: 'e2e-book', status: 'draft' }, 201)
    }

    const bookMatch = path.match(/^\/books\/(book-\d+)$/)
    if (bookMatch && method === 'PUT') {
      backend.bookPuts += 1
      return ok(route, { _id: bookMatch[1] })
    }

    const manageMatch = path.match(/^\/books\/manage\/(book-\d+)$/)
    if (manageMatch && method === 'GET') {
      return ok(route, {
        _id: manageMatch[1],
        title: 'E2E Book',
        chapters: backend.chapters.filter((c) => c.bookId === manageMatch[1]),
      })
    }

    if (path === '/chapters/pages/upload' && method === 'POST') {
      backend.uploadPosts += 1
      if (behaviour.upload === 'missing') {
        return route.fulfill({
          status: 404,
          contentType: 'text/html',
          body: '<pre>Cannot POST /api/chapters/pages/upload</pre>',
        })
      }
      if (behaviour.upload === 'fail') return fail(route, 500, 'Internal server error')
      const count = (req.postData()?.match(/name="pages"/g) ?? []).length
      return ok(
        route,
        Array.from({ length: count }, (_, i) => ({
          url: `/uploads/pages/books/e2e-book/chapters/1/page-00${i + 1}-u${backend.uploadPosts}.webp`,
          displayName: `page-${i + 1}`,
        })),
        201,
      )
    }

    if (path === '/chapters' && method === 'POST') {
      backend.chapterPosts += 1
      const body = req.postData() ?? ''
      const manifest = JSON.parse(body.match(/name="pageManifest"\r\n\r\n([\s\S]*?)\r\n--/)?.[1] ?? '[]')
      backend.chapterManifests.push(manifest)
      const bookId = body.match(/name="bookId"\r\n\r\n(.*?)\r\n/)?.[1] ?? ''
      const chapterNumber = Number(body.match(/name="chapterNumber"\r\n\r\n(.*?)\r\n/)?.[1] ?? 1)
      const title = body.match(/name="title"\r\n\r\n(.*?)\r\n/)?.[1] ?? ''

      if (backend.chapters.some((c) => c.bookId === bookId && c.chapterNumber === chapterNumber)) {
        return fail(route, 409, `Chapter ${chapterNumber} already exists for this book`)
      }
      if (backend.chapterPosts === 1 && behaviour.firstChapter === 'fail') {
        return fail(route, 500, 'Internal server error')
      }
      const chapter = {
        _id: `chapter-${nextId++}`,
        bookId,
        chapterNumber,
        title,
        pageImageUrls: manifest.map((_: unknown, i: number) => `/uploads/p${i}.webp`),
      }
      backend.chapters.push(chapter)
      if (backend.chapterPosts === 1 && behaviour.firstChapter === 'lose-response') {
        return fail(route, 500, 'Internal server error')
      }
      return ok(route, chapter, 201)
    }

    const chapterMatch = path.match(/^\/chapters\/(chapter-\d+)$/)
    if (chapterMatch && method === 'PUT') {
      backend.chapterPuts += 1
      return ok(route, { _id: chapterMatch[1] })
    }

    return route.fallback()
  })

  return backend
}

async function openNewBookForm(page: Page) {
  await seedAuth(page, ADMIN_USER)
  await installApiMocks(page, { user: ADMIN_USER })
}

async function fillBookAndChapter(page: Page) {
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Books', exact: true }).click()
  await page.getByRole('button', { name: 'Add new book' }).click()

  await page.getByPlaceholder('e.g. The Enchanted Kingdom').fill('E2E Book')
  await page.getByPlaceholder('e.g. Jane Smith').fill('E2E Author')
  await page.getByPlaceholder('Brief synopsis for readers…').fill('A short synopsis.')
  await page
    .locator('input[type=file]:not([multiple])')
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })

  await page.getByRole('button', { name: /Search and select/ }).first().click()
  await page.getByRole('button', { name: 'Romance' }).click()
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)

  await page
    .locator('input[type=file][multiple]')
    .setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: PNG },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    ])
  await page.getByPlaceholder('Chapter 1').fill('Opening')
}

const saveButton = (page: Page) => page.getByRole('button', { name: /Save draft|Saving|Uploading|Saving chapter/ })

test.describe('admin: add a book with a chapter', () => {
  test('creates one book and one chapter from uploaded pages', async ({ page }) => {
    await openNewBookForm(page)
    const backend = await installBookBackend(page, { upload: 'ok', firstChapter: 'ok' })
    await fillBookAndChapter(page)

    await saveButton(page).click()
    await expect(page.getByRole('button', { name: 'Add new book' })).toBeVisible({ timeout: 15_000 })

    expect(backend.bookPosts).toBe(1)
    expect(backend.chapters).toHaveLength(1)
    expect(backend.chapterManifests[0].map((p) => p.type)).toEqual(['uploaded', 'uploaded'])
  })

  test('still saves when the API has no batch upload route yet (old server build)', async ({ page }) => {
    await openNewBookForm(page)
    const backend = await installBookBackend(page, { upload: 'missing', firstChapter: 'ok' })
    await fillBookAndChapter(page)

    await saveButton(page).click()
    await expect(page.getByRole('button', { name: 'Add new book' })).toBeVisible({ timeout: 15_000 })

    expect(backend.bookPosts).toBe(1)
    expect(backend.chapters).toHaveLength(1)
    expect(backend.chapterManifests[0].map((p) => p.type)).toEqual(['new', 'new'])
  })

  test('retrying after a failed chapter never creates the book twice', async ({ page }) => {
    await openNewBookForm(page)
    const backend = await installBookBackend(page, { upload: 'ok', firstChapter: 'fail' })
    await fillBookAndChapter(page)

    await saveButton(page).click()
    await expect(page.getByRole('alert')).toContainText('saved as a draft')
    await expect(page.getByRole('alert')).toContainText('Chapter 1 could not be saved')
    expect(backend.bookPosts).toBe(1)
    expect(backend.chapters).toHaveLength(0)

    await saveButton(page).click()
    await expect(page.getByRole('button', { name: 'Add new book' })).toBeVisible({ timeout: 15_000 })

    expect(backend.bookPosts).toBe(1) // not recreated
    expect(backend.books).toHaveLength(1)
    expect(backend.chapters).toHaveLength(1)
    expect(backend.uploadPosts).toBe(1) // pages were not uploaded again
  })

  test('adopts a chapter that was saved but whose response was lost', async ({ page }) => {
    await openNewBookForm(page)
    const backend = await installBookBackend(page, { upload: 'ok', firstChapter: 'lose-response' })
    await fillBookAndChapter(page)

    await saveButton(page).click()
    await expect(page.getByRole('alert')).toContainText('Chapter 1 could not be saved')

    await saveButton(page).click()
    await expect(page.getByRole('button', { name: 'Add new book' })).toBeVisible({ timeout: 15_000 })

    expect(backend.bookPosts).toBe(1)
    expect(backend.chapters).toHaveLength(1) // no duplicate chapter
    expect(backend.chapterPuts).toBe(1) // existing chapter was updated instead
  })
})
