
import React, { useState } from 'react'
import api from '../api'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await api.post('/admin/auth/login', {
        username,
        password,
      })

      const { token, admin } = res.data

      if (!token) {
        throw new Error('Login response does not contain a token')
      }

      localStorage.setItem('gs_admin_token', token)
      localStorage.setItem('gs_admin_user', JSON.stringify(admin || {}))

      if (onLogin) onLogin(admin)

    } catch (err) {
      console.error('Login failed:', err)

      const rawError =
        err.response?.data?.error ??
        err.response?.data?.message

      const errorMessage =
        typeof rawError === 'string'
          ? rawError
          : typeof rawError?.message === 'string'
            ? rawError.message
            : typeof err.message === 'string'
              ? err.message
              : 'Login failed. Please try again.'

      setError(errorMessage)

    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-blue-600 flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
            <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            GateShield Admin
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Sign in to access the gateway dashboard
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 space-y-4"
        >
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-sm font-medium shadow-sm transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
