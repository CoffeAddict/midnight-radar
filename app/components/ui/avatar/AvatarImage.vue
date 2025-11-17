<script setup lang="ts">
import { AvatarImage as RekaAvatarImage, type AvatarImageProps } from 'reka-ui'
import { cn } from '~/lib/utils'

const props = defineProps<AvatarImageProps & { class?: string }>()
</script>

<template>
  <RekaAvatarImage v-bind="props" :class="cn('aspect-square h-full w-full', props.class)" />
</template>
