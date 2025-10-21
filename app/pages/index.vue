<template>
  <main class="min-h-screen bg-neutral-950 px-6 py-12 text-white">
    <div class="mx-auto max-w-3xl space-y-6">
      <h1 class="text-3xl font-semibold">Midnight Radar Recommendations (debug)</h1>
      <p class="text-neutral-400">Open the console to inspect the raw recommendation output.</p>
      <pre class="rounded bg-neutral-900 p-4 text-sm text-neutral-200">{{ recommendations }}</pre>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRecommendationEngine } from '~/composables/useRecommendationEngine'
import type { Recommendation } from '~/composables/useRecommendationEngine'

const recommendations = ref<Recommendation[]>([])
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  const engine = useRecommendationEngine()

  try {
    const recs = await engine.generateRecommendations()
    recommendations.value = recs
    console.log('Generated recommendations', recs)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate recommendations.'
    errorMessage.value = message
    console.error(message, error)
  }
})
</script>
