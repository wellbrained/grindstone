<script setup lang="ts">
import type { DecodedToken } from '#shared/levels'

// One JSON Web Token, decoded (chapter 3; docs/features/ui.md, "Web fundamentals play page"): where it is kept, its
// header and payload as JSON text, and its times on the scripted clock (issued, expires, or that it never runs out).
// Never verified: anyone can read a token, only the secret's owner can make one. Text only.
const props = defineProps<{
  /** Where it is ('localStorage: token', 'cookie: session'). */
  where: string
  decoded: DecodedToken
  /** The scripted clock's time (ms), or null before the frame said. */
  now: number | null
}>()

const { t } = useI18n()

const json = (value: unknown) => JSON.stringify(value, null, 2)
const issued = computed(() => typeof props.decoded.payload.iat === 'number' ? clockLabel(props.decoded.payload.iat * 1000, props.now) : null)
const expiry = computed(() => expiryOf(props.decoded.payload, props.now))
</script>

<template>
  <section
    class="rounded-md border border-(--app-terminal-border) bg-elevated/40 px-2 py-1.5 text-xs"
    :aria-label="t('web.token.label', { where })"
    data-testid="token"
  >
    <p class="font-medium text-highlighted">
      {{ t('web.token.heading') }} <span class="font-mono">{{ where }}</span>
    </p>
    <!-- its times only once the frame has said what time it is -->
    <p
      v-if="now !== null"
      class="text-muted"
      data-testid="token-times"
    >
      <span v-if="issued">{{ t('web.token.issued', { time: issued }) }} · </span>
      <span
        v-if="expiry.state === 'none'"
        class="text-warning"
      >{{ t('web.token.noExpiry') }}</span>
      <span
        v-else-if="expiry.state === 'expired'"
        class="text-error"
      >{{ t('web.token.expired', { time: clockLabel(expiry.at, now), n: expiry.minutes }) }}</span>
      <span v-else>{{ t('web.token.expires', { time: clockLabel(expiry.at, now), n: expiry.minutes }) }}</span>
    </p>
    <div class="mt-1 grid gap-1 @md:grid-cols-2">
      <div>
        <p class="text-dimmed">
          {{ t('web.token.header') }}
        </p>
        <pre class="overflow-x-auto font-mono text-toned">{{ json(decoded.header) }}</pre>
      </div>
      <div>
        <p class="text-dimmed">
          {{ t('web.token.payload') }}
        </p>
        <pre
          class="overflow-x-auto font-mono text-toned"
          data-testid="token-payload"
        >{{ json(decoded.payload) }}</pre>
      </div>
    </div>
    <p class="mt-1 text-dimmed">
      {{ t('web.token.signature') }}
    </p>
  </section>
</template>
