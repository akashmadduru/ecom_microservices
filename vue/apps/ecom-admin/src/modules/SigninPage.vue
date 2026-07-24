<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto flex max-w-md flex-col gap-6">
      <div class="card w-full">
        <div class="card-body">
          <p class="section-kicker section-kicker-sm">Admin</p>
          <h1 class="text-3xl font-semibold">Log in to the admin console</h1>

          <form class="mt-6 flex flex-col space-y-4" @submit.prevent="onSubmit" novalidate>
            <div v-if="formError.formError.value" class="alert-soft-error">
              {{ formError.formError.value }}
            </div>

            <label class="form-field">
              <input
                v-model="form.username"
                class="input input-bordered"
                :class="{ 'input-error': formError.fieldError('username') }"
                type="text"
                placeholder="Enter username"
                required
              />
              <span v-if="formError.fieldError('username')" class="field-error">{{
                formError.fieldError('username')
              }}</span>
            </label>
            <label class="form-field">
              <input
                v-model="form.password"
                class="input input-bordered"
                :class="{ 'input-error': formError.fieldError('password') }"
                type="password"
                placeholder="Enter password"
                required
                minlength="1"
              />
              <span v-if="formError.fieldError('password')" class="field-error">{{
                formError.fieldError('password')
              }}</span>
            </label>
            <button
              :class="['btn btn-primary w-full', { 'opacity-70': processing }]"
              type="submit"
              :disabled="processing"
            >
              {{ processing ? 'Signing in...' : 'Log in' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from 'core/stores/auth'
import { useNotificationStore } from 'core/stores/notification'
import { useFormErrors } from 'core/composables/useFormErrors'
import type { SigninPayload } from 'core/interfaces/auth'

const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const router = useRouter()
const route = useRoute()
const processing = ref(false)
const formError = useFormErrors()

const form = reactive<SigninPayload>({ username: '', password: '' })

async function onSubmit() {
  formError.clear()
  processing.value = true
  try {
    const user = await authStore.signInUser(form)
    notificationStore.showToast(`Welcome back, ${user.username}!`, 'success')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch (err) {
    const apiError = formError.setFromError(err)
    notificationStore.showToast(apiError.message, 'error', 'Sign in failed')
  } finally {
    processing.value = false
  }
}
</script>
