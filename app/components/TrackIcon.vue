<script setup lang="ts">
import { trackLook } from '~/utils/track-look'

// A track's icon on a 15% tint of its colour (decoration: the track's name is always written beside it).
const props = withDefaults(defineProps<{ trackId: string, size?: 'sm' | 'md' }>(), { size: 'md' })
const look = computed(() => trackLook(props.trackId))
</script>

<template>
  <span
    aria-hidden="true"
    class="grid shrink-0 place-items-center bg-current/15"
    :class="[look.class, size === 'sm' ? 'size-6 rounded-md' : 'size-10 rounded-lg']"
  >
    <UIcon
      :name="look.icon"
      :class="size === 'sm' ? 'size-3.5' : 'size-5'"
    />
  </span>
</template>
