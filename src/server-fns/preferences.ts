import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/lib/db'
import { scoreAllArticles } from '~/lib/ai'

export const getPreferences = createServerFn({ method: 'GET' }).handler(() => {
  const db = getDb()
  return db.prepare('SELECT * FROM preferences WHERE id = 1').get()
})

export const updatePreferences = createServerFn({ method: 'PUT' })
  .inputValidator((data: { promptText: string }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const { promptText } = data

    db.prepare('UPDATE preferences SET prompt_text = ? WHERE id = 1').run(promptText)

    await scoreAllArticles()

    return { ok: true }
  })