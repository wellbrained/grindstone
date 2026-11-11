<script setup lang="ts">
definePageMeta({
  example: {
    title: 'Images',
    description: '@nuxt/image resizes, converts (webp/avif) and lazy-loads images. Local images go in public/; remote hosts must be allowed via image.domains in nuxt.config.',
    icon: 'i-lucide-image',
    order: 7
  }
})
</script>

<template>
  <ExamplePage
    docs="https://image.nuxt.com/usage/nuxt-img"
    :files="['app/pages/examples/image.vue', 'public/images/example.jpg']"
  >
    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            NuxtImg — fixed size, converted to webp
          </h2>
        </template>

        <!-- The 1600px source is served as a 600px-wide webp -->
        <NuxtImg
          src="/images/example.jpg"
          alt="Example image"
          width="600"
          height="338"
          format="webp"
          class="h-auto w-full rounded-md"
        />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            NuxtImg — responsive with sizes
          </h2>
        </template>

        <!-- Generates srcset + sizes; the browser picks the best width for the screen.
             Syntax: "<default> <breakpoint>:<size> …" with breakpoints sm, md, lg, xl, xxl -->
        <NuxtImg
          src="/images/example.jpg"
          alt="Example image"
          sizes="100vw sm:50vw lg:600px"
          format="webp"
          loading="lazy"
          class="h-auto w-full rounded-md"
        />
      </UCard>

      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="font-semibold">
            NuxtPicture — avif with webp fallback
          </h2>
        </template>

        <!-- Renders <picture> with multiple <source> formats -->
        <NuxtPicture
          src="/images/example.jpg"
          alt="Example image"
          format="avif,webp"
          sizes="100vw lg:1000px"
          :img-attrs="{ class: 'h-auto w-full rounded-md' }"
        />
      </UCard>
    </div>
  </ExamplePage>
</template>
