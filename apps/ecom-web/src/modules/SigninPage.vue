<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row">
      <div class="card w-full">
        <div class="card-body">
          <p class="section-kicker section-kicker-sm">Welcome back</p>
          <h1 class="text-3xl font-semibold">Log in to your account</h1>

          <div class="mt-6 space-y-4">
            <div id="google-signin-button" class="w-full" />
            <div v-if="googleHint"
              class="rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-content">
              {{ googleHint }}
            </div>
            <a class="btn btn-outline w-full" :href="authStore.googleAuthorizeRedirectUrl()">
              Continue with Google (redirect)
            </a>
            <div class="flex items-center gap-3 text-sm text-muted">
              <div class="h-px flex-1 bg-base-300" />
              <span>or continue with email</span>
              <div class="h-px flex-1 bg-base-300" />
            </div>
          </div>

          <form class="mt-6 flex flex-col space-y-4" @submit.prevent="onSubmit" novalidate>
            <div v-if="formError.formError.value"
              class="alert-soft-error">
              {{ formError.formError.value }}
            </div>

            <label class="form-field">
              <input v-model="form.username" class="input input-bordered"
                :class="{ 'input-error': formError.fieldError('username') }" type="text"
                placeholder="Enter username" required />
              <span v-if="formError.fieldError('username')" class="field-error">{{
                formError.fieldError('username') }}</span>
            </label>
            <label class="form-field">
              <input v-model="form.password" class="input input-bordered"
                :class="{ 'input-error': formError.fieldError('password') }" type="password"
                placeholder="Enter password" required minlength="1" />
              <span v-if="formError.fieldError('password')" class="field-error">{{
                formError.fieldError('password') }}</span>
            </label>
            <button :class="['btn btn-primary w-full', { 'opacity-70': processing }]" type="submit"
              :disabled="processing">{{ processing ? 'Signing in...' : 'Log in' }}</button>
          </form>
          <p class="mt-4 text-sm text-muted">
            New here? {{ ' ' }}
            <router-link class="link link-primary" to="/signup">Create an account</router-link>
          </p>
        </div>
      </div>

      <div class="card w-full">
        <div class="card-body feature-list-card">
          <h2 class="text-xl font-semibold">Quick access</h2>
          <ul class="mt-4 space-y-3 text-sm text-muted">
            <li>Track orders and returns</li>
            <li>Save favorites in wishlist</li>
            <li>Add and manage delivery addresses</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import type { SigninPayload } from '@/interfaces/auth'

const authStore = useAuthStore()
const ecommerceStore = useEcommerceStore()

const router = useRouter()
const route = useRoute()
const processing = ref(false)
const googleHint = ref('')
const formError = useFormErrors()

const form = reactive<SigninPayload>({ username: '', password: '' })

async function onSubmit() {
  formError.clear()
  processing.value = true
  try {
    const user = await authStore.signInUser(form)
    ecommerceStore.showToast(`Welcome back, ${user.username}!`, 'success')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Sign in failed')
  } finally {
    processing.value = false
  }
}

async function handleGoogleCredentialResponse(response: { credential: string }) {
  try {
    const user = await authStore.signInWithGoogle(response.credential)
    ecommerceStore.showToast(`Welcome, ${user.username}!`, 'success')
    router.push('/')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Google sign-in failed')
  }
}

function initializeGoogleButton() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    googleHint.value = 'Set VITE_GOOGLE_CLIENT_ID to enable Google Sign-In.'
    return
  }

  if (!window.google?.accounts?.id) {
    googleHint.value = 'Google sign-in script is still loading. Please refresh if needed.'
    return
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredentialResponse,
    auto_select: false,
    cancel_on_tap_outside: true,
  })

  const buttonContainer = document.getElementById('google-signin-button')
  if (buttonContainer) {
    buttonContainer.innerHTML = ''
    window.google.accounts.id.renderButton(buttonContainer, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: '100%',
    })
  }
}

onMounted(() => {
  if (window.google?.accounts?.id) {
    initializeGoogleButton()
    return
  }

  const script = document.createElement('script')
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.onload = initializeGoogleButton
  document.head.appendChild(script)
})
</script>
