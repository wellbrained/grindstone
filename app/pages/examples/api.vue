<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { todoCreateSchema, type TodoCreate } from '#shared/schemas/todo'

definePageMeta({
  example: {
    title: 'Server API',
    description: 'Typed API routes in server/api with Zod validation, useFetch and $fetch. One schema (shared/) validates client and server.',
    icon: 'i-lucide-server',
    order: 3
  }
})

// useFetch: runs on the server during SSR, is deduplicated and its response is typed
// automatically from the API route's return value (here: Todo[]).
const { data: todos, status, refresh } = await useFetch('/api/examples/todos')

const toast = useToast()
const state = reactive<Partial<TodoCreate>>({ title: '' })
const form = useTemplateRef('form')

// $fetch: for user-triggered requests (submit, click). Also fully typed.
async function onSubmit(event: FormSubmitEvent<TodoCreate>) {
  try {
    await $fetch('/api/examples/todos', { method: 'POST', body: event.data })
    state.title = ''
    form.value?.clear() // remove errors from earlier failed submits
    await refresh()
  } catch (error) {
    // Server-side validation errors land here (status 400)
    toast.add({ title: 'Could not add todo', description: getErrorMessage(error), color: 'error' })
  }
}

async function toggle(id: number) {
  await $fetch(`/api/examples/todos/${id}`, { method: 'PATCH' })
  await refresh()
}
</script>

<template>
  <ExamplePage
    docs="https://nuxt.com/docs/guide/directory-structure/server"
    :files="[
      'app/pages/examples/api.vue',
      'server/api/examples/todos.get.ts',
      'server/api/examples/todos.post.ts',
      'server/api/examples/todos/[id].patch.ts',
      'server/utils/example-todos.ts',
      'shared/schemas/todo.ts'
    ]"
  >
    <UCard class="max-w-xl">
      <UForm
        ref="form"
        :schema="todoCreateSchema"
        :validate-on="['change']"
        :state="state"
        class="flex items-start gap-2"
        @submit="onSubmit"
      >
        <UFormField
          name="title"
          class="flex-1"
        >
          <UInput
            v-model="state.title"
            placeholder="What needs to be done?"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          icon="i-lucide-plus"
          label="Add"
        />
      </UForm>

      <USeparator class="my-4" />

      <p
        v-if="status === 'pending'"
        class="text-sm text-muted"
      >
        Loading…
      </p>

      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="todo in todos"
          :key="todo.id"
        >
          <UCheckbox
            :model-value="todo.done"
            :label="todo.title"
            :ui="{ label: todo.done ? 'line-through text-muted' : '' }"
            @update:model-value="toggle(todo.id)"
          />
        </li>
      </ul>
    </UCard>

    <p class="mt-4 text-sm text-muted">
      Try it directly: <ULink
        to="/api/examples/todos"
        target="_blank"
        external
      >GET /api/examples/todos</ULink>. Data is kept in memory and resets when the server restarts.
    </p>
  </ExamplePage>
</template>
