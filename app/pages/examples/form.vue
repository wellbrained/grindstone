<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  example: {
    title: 'Form + Zod',
    description: 'UForm validated with a Zod schema — errors per field and typed submit data.',
    icon: 'i-lucide-text-cursor-input',
    order: 2
  }
})

// The schema defines validation rules AND the TypeScript type of the form data
const schema = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
  role: z.enum(['developer', 'designer', 'manager']),
  terms: z.literal(true, 'You must accept the terms')
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  email: undefined,
  password: undefined,
  role: 'developer',
  terms: undefined
})

const roles = ['developer', 'designer', 'manager']

const toast = useToast()

// Only called when validation passes — `event.data` is fully typed
async function onSubmit(event: FormSubmitEvent<Schema>) {
  toast.add({ title: 'Success', description: `Submitted as ${event.data.email} (${event.data.role})`, color: 'success' })
}
</script>

<template>
  <ExamplePage
    docs="https://ui.nuxt.com/docs/components/form"
    :files="['app/pages/examples/form.vue']"
  >
    <UCard class="max-w-md">
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Email"
          name="email"
        >
          <UInput
            v-model="state.email"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Password"
          name="password"
          help="At least 8 characters"
        >
          <UInput
            v-model="state.password"
            type="password"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Role"
          name="role"
        >
          <USelect
            v-model="state.role"
            :items="roles"
            class="w-full"
          />
        </UFormField>

        <UFormField name="terms">
          <UCheckbox
            v-model="state.terms"
            label="I accept the terms"
          />
        </UFormField>

        <UButton type="submit">
          Submit
        </UButton>
      </UForm>
    </UCard>
  </ExamplePage>
</template>
