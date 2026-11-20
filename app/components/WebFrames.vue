<script setup lang="ts">
import type { SecurityMessage } from '#shared/levels'

// The Application panel's Frames (Web fundamentals chapter 7; docs/features/ui.md, "Web fundamentals play page"): the
// page as the browser loaded it, like Chrome's Application > Frames > top: its address and the document's status, the
// security headers the answer carried, and its Content Security Policies as the browser parsed them (where each came
// from, enforced or report-only, every directive and its value), plus the referrer policy in force. Everything is text.
const props = defineProps<{ security: SecurityMessage | null, predicting: boolean }>()

const { t } = useI18n()

const policies = computed(() => props.security?.policies ?? [])
</script>

<template>
  <div data-testid="application-frames">
    <p
      v-if="!security"
      class="text-xs text-dimmed"
    >
      {{ predicting ? t('web.server.waiting') : t('web.frames.loading') }}
    </p>
    <template v-else>
      <section
        class="mb-3"
        aria-labelledby="frames-top"
      >
        <h3
          id="frames-top"
          class="mb-1 text-xs font-semibold text-highlighted"
        >
          {{ t('web.frames.top') }}
        </h3>
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          <dt class="text-muted">
            {{ t('web.frames.url') }}
          </dt>
          <dd
            class="font-mono break-all text-highlighted"
            data-testid="frames-url"
          >
            {{ security.url }}
          </dd>
          <dt class="text-muted">
            {{ t('web.frames.status') }}
          </dt>
          <dd class="font-mono text-highlighted">
            {{ security.status || t('web.frames.noAnswer') }}
          </dd>
          <dt class="text-muted">
            {{ t('web.frames.referrer') }}
          </dt>
          <dd
            class="font-mono text-highlighted"
            data-testid="frames-referrer"
          >
            {{ security.referrer || t('web.frames.referrerDefault') }}
          </dd>
        </dl>
      </section>

      <section
        class="mb-3"
        aria-labelledby="frames-headers"
      >
        <h3
          id="frames-headers"
          class="mb-1 text-xs font-semibold text-highlighted"
        >
          {{ t('web.frames.headers') }}
        </h3>
        <p
          v-if="!security.headers.length"
          class="text-xs text-dimmed"
          data-testid="frames-no-headers"
        >
          {{ t('web.frames.noHeaders') }}
        </p>
        <ul
          v-else
          class="space-y-0.5 font-mono text-xs"
        >
          <li
            v-for="([name, value], index) in security.headers"
            :key="index"
            class="break-all"
            data-testid="frames-header"
          >
            <span class="text-muted">{{ name }}:</span> <span class="text-highlighted">{{ value }}</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="frames-policies">
        <h3
          id="frames-policies"
          class="mb-1 text-xs font-semibold text-highlighted"
        >
          {{ t('web.frames.policies', policies.length) }}
        </h3>
        <p
          v-if="!policies.length"
          class="text-xs text-dimmed"
        >
          {{ t('web.frames.noPolicy') }}
        </p>
        <article
          v-for="(policy, index) in policies"
          :key="index"
          class="mb-2 rounded-md border border-default p-2 last:mb-0"
          :aria-label="t('web.frames.policyName', { n: index + 1, source: t(`web.frames.source.${policy.source}`), type: t(`web.frames.type.${policy.type}`) })"
          :data-source="policy.source"
          :data-type="policy.type"
          data-testid="frames-policy"
        >
          <p class="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span class="rounded bg-accented px-1.5 py-0.5 text-toned">{{ t(`web.frames.source.${policy.source}`) }}</span>
            <span
              class="rounded px-1.5 py-0.5"
              :class="policy.type === 'enforce' ? 'bg-success/15 text-highlighted' : 'bg-warning/15 text-highlighted'"
            >{{ t(`web.frames.type.${policy.type}`) }}</span>
          </p>
          <p
            v-if="!policy.directives.length"
            class="text-xs text-dimmed"
          >
            {{ t('web.frames.noDirectives') }}
          </p>
          <dl
            v-else
            class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-xs"
          >
            <template
              v-for="([name, value], at) in policy.directives"
              :key="at"
            >
              <dt class="text-muted">
                {{ name }}
              </dt>
              <dd class="break-all text-highlighted">
                {{ value || t('web.frames.emptyValue') }}
              </dd>
            </template>
          </dl>
        </article>
      </section>
    </template>
  </div>
</template>
