<script setup lang="ts">
// A short burst of embers when a level is solved. Pure CSS (.spark in main.css), hidden for prefers-reduced-motion.
const props = defineProps<{ trigger: number }>()

const active = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const SPARKS = 18
const sparks = Array.from({ length: SPARKS }, (_, index) => {
  const angle = (index / SPARKS) * Math.PI * 2 + (index % 2) * 0.25
  const distance = 70 + (index * 29) % 80
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance) - 24,
    delay: (index % 5) * 0.04
  }
})

watch(() => props.trigger, async (value) => {
  if (!value) return
  clearTimeout(timer)
  active.value = false
  await nextTick()
  active.value = true
  timer = setTimeout(() => {
    active.value = false
  }, 1500)
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    v-if="active"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 overflow-hidden"
  >
    <span
      v-for="(spark, index) in sparks"
      :key="index"
      class="spark"
      :style="{ '--spark-x': `${spark.x}px`, '--spark-y': `${spark.y}px`, '--spark-delay': `${spark.delay}s` }"
    />
  </div>
</template>
