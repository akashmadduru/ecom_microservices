<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row">
      <div class="card w-full">
        <div class="card-body">
          <h1 class="text-3xl font-semibold">Create your account</h1>
          <p class="text-sm text-muted">Join the store to save wishlist items, track orders, and checkout
            faster.</p>

          <form class="mt-6 space-y-4" @submit.prevent="onSubmit" novalidate>
            <div v-if="formError.formError.value"
              class="alert-soft-error">
              {{ formError.formError.value }}
            </div>

            <div class="form-row-2">
              <label class="form-field">
                <input v-model="form.username" class="input input-bordered"
                  :class="{ 'input-error': formError.fieldError('username') || usernameError }" type="text"
                  placeholder="Username" required minlength="3" @blur="touched.username = true" />
                <span v-if="usernameError" class="field-error">{{ usernameError }}</span>
                <span v-else-if="formError.fieldError('username')" class="field-error">{{
                  formError.fieldError('username') }}</span>
              </label>
              <label class="form-field">
                <input v-model="form.email" class="input input-bordered"
                  :class="{ 'input-error': formError.fieldError('email') || emailError }" type="email"
                  placeholder="you@example.com" required @blur="touched.email = true" />
                <span v-if="emailError" class="field-error">{{ emailError }}</span>
                <span v-else-if="formError.fieldError('email')" class="field-error">{{
                  formError.fieldError('email') }}</span>
              </label>
            </div>
            <label class="form-field">
              <input v-model="form.password" class="input input-bordered"
                :class="{ 'input-error': formError.fieldError('password') || passwordError }" type="password"
                placeholder="Minimum 8 characters" required minlength="8" @blur="touched.password = true" />
              <span v-if="passwordError" class="field-error">{{ passwordError }}</span>
              <span v-else-if="formError.fieldError('password')" class="field-error">{{
                formError.fieldError('password') }}</span>
            </label>

            <button :class="['mt-4 btn btn-primary w-full', { 'opacity-70': processing }]" type="submit"
              :disabled="processing">{{ processing ? 'Creating...' : 'Sign up' }}</button>
          </form>
        </div>
      </div>
      <div class="card w-full">
        <div class="card-body feature-list-card">
          <h2 class="text-2xl font-semibold">Why sign up?</h2>
          <ul class="mt-4 space-y-3 text-sm">
            <li>Save products to your wishlist</li>
            <li>Track your orders in one place</li>
            <li>Add multiple delivery addresses</li>
            <li>Get early access to new launches</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useFormErrors } from '@/composables/useFormErrors'
import type { SignupPayload } from '@/interfaces/auth'

const authStore = useAuthStore()
const ecommerceStore = useEcommerceStore()
const router = useRouter()
const processing = ref(false)
const formError = useFormErrors()

const form = reactive<SignupPayload>({ username: '', email: '', password: '' })
const touched = reactive({ username: false, email: false, password: false })

const usernameError = computed(() => {
  if (!touched.username) return ''
  if (!form.username.trim()) return 'Username is required.'
  if (form.username.trim().length < 3) return 'Username must be at least 3 characters.'
  return ''
})

const emailError = computed(() => {
  if (!touched.email) return ''
  if (!form.email.trim()) return 'Email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.'
  return ''
})

const passwordError = computed(() => {
  if (!touched.password) return ''
  if (form.password.length < 8) return 'Password must be at least 8 characters.'
  return ''
})

function validate(): boolean {
  touched.username = true
  touched.email = true
  touched.password = true
  return !usernameError.value && !emailError.value && !passwordError.value
}

async function onSubmit() {
  formError.clear()
  if (!validate()) return

  processing.value = true
  try {
    const user = await authStore.signUpUser(form)
    ecommerceStore.showToast(`Account created for ${user.username}.`, 'success')
    router.push('/')
  } catch (err) {
    const apiError = formError.setFromError(err)
    ecommerceStore.showToast(apiError.message, 'error', 'Sign up failed')
  } finally {
    processing.value = false
  }
}
</script>
