<template>
    <section class="surface-card">
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div class="space-y-2">
                <div class="eyebrow-pill">
                    <span class="text-sm">✦</span>
                    <span>{{ eyebrow }}</span>
                </div>
                <div>
                    <h1 class="text-3xl font-semibold">{{ title }}</h1>
                    <p v-if="description" class="mt-2 max-w-2xl text-sm text-muted">{{ description }}</p>
                </div>
            </div>
            <div v-if="$slots.action" class="flex items-center">
                <slot name="action" />
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
defineProps<{
    eyebrow: string
    title: string
    description?: string
}>()
</script>
