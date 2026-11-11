<script setup lang="ts">
definePageMeta({
  example: {
    title: 'PostgreSQL + Drizzle (layer)',
    description: 'Typed queries, migrations and drizzle-zod validation. Runs on embedded PGlite until you set NUXT_POSTGRES_URL.',
    icon: 'i-simple-icons-postgresql',
    order: 30
  }
})

const API = '/api/examples/postgres/notes'

// Response type is inferred from the API route (driver, total, notes)
const { data, refresh } = await useFetch(API)

const toast = useToast()
const text = ref('')
const saving = ref(false)

async function addNote() {
  saving.value = true
  try {
    await $fetch(API, { method: 'POST', body: { text: text.value } })
    text.value = ''
    await refresh()
  } catch (error) {
    // Validation happens on the server (drizzle-zod schema) — show its message
    toast.add({ title: 'Could not save note', description: getErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function removeNote(id: number) {
  await $fetch(`${API}/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <ExamplePage
    docs="https://orm.drizzle.team/docs/get-started/postgresql-new"
    :files="[
      'layers/db-postgres/app/pages/examples/postgres.vue',
      'layers/db-postgres/server/db/schema.ts',
      'layers/db-postgres/server/utils/postgres.ts',
      'layers/db-postgres/server/api/examples/postgres/',
      'layers/db-postgres/server/plugins/postgres.ts',
      'layers/db-postgres/drizzle.config.ts'
    ]"
  >
    <div class="grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-2">
        <form
          class="flex gap-2"
          @submit.prevent="addNote"
        >
          <UInput
            v-model="text"
            placeholder="Write a note (saved in the database)"
            class="flex-1"
          />
          <UButton
            type="submit"
            icon="i-lucide-plus"
            label="Add"
            :loading="saving"
          />
        </form>

        <USeparator class="my-4" />

        <p
          v-if="!data?.notes.length"
          class="text-sm text-muted"
        >
          No notes yet. Notes survive server restarts — they are stored in the database.
        </p>

        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="note in data.notes"
            :key="note.id"
            class="flex items-center justify-between gap-4 py-2"
          >
            <div>
              <p>{{ note.text }}</p>
              <p class="text-xs text-muted">
                <!-- NuxtTime: formats dates without server/browser locale mismatches -->
                #{{ note.id }} · <NuxtTime
                  :datetime="note.createdAt"
                  date-style="medium"
                  time-style="short"
                />
              </p>
            </div>
            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              aria-label="Delete note"
              @click="removeNote(note.id)"
            />
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Connection
          </h2>
        </template>

        <dl class="space-y-2 text-sm">
          <div>
            <dt class="text-muted">
              Driver
            </dt>
            <dd>
              <UBadge
                :label="data?.driver === 'pglite' ? 'PGlite (embedded)' : 'PostgreSQL server'"
                variant="subtle"
              />
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Notes (count(*) via sql``)
            </dt>
            <dd class="font-mono">
              {{ data?.total }}
            </dd>
          </div>
        </dl>

        <p class="mt-4 text-xs text-muted">
          Set <code>NUXT_POSTGRES_URL</code> in <code>.env</code> to use a real server. Schema changes:
          edit <code>schema.ts</code>, run <code>pnpm db:postgres:generate</code>, restart.
        </p>
      </UCard>
    </div>
  </ExamplePage>
</template>
