<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastNotifications from 'lib/widgets/ToastNotifications.vue'
</script>

<template>
  <div class="min-h-screen pt-4 text-base-content">
    <RouterView />
    <ToastNotifications />
  </div>
</template>
