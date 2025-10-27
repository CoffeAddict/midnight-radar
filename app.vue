<template>
  <div>
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
// Apply dark mode class to the HTML element using Nuxt's head management
useHead({
  htmlAttrs: {
    class: 'dark'
  }
})
</script>
