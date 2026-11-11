<!-- Minimal layout without header/footer (e.g. for login or landing pages).
     Select it in a page with `definePageMeta({ layout: 'blank' })`. -->
<template>
  <UMain class="flex items-center justify-center">
    <slot />
  </UMain>
</template>
