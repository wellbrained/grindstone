<script setup lang="ts">
const { site } = useAppConfig()
</script>

<template>
  <UPageHero
    :title="site.name"
    :description="site.description"
    :links="[{
      label: 'View examples',
      to: '/examples',
      trailingIcon: 'i-lucide-arrow-right',
      size: 'xl'
    }, {
      label: 'Nuxt UI docs',
      to: 'https://ui.nuxt.com/docs/components',
      target: '_blank',
      size: 'xl',
      color: 'neutral',
      variant: 'subtle'
    }]"
  />
</template>
