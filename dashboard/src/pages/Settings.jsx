import React, { useState, useEffect, useCallback } from 'react'
import api from '../api'
import ConfigEditor from '../components/ConfigEditor'

export default function Settings() {
  const [configs, setConfigs] = useState([])
  const [circuitBreaker, setCircuitBreaker] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cbLoading, setCbLoading] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const [configRes, cbRes] = await Promise.allSettled([
        api.get('/admin/config'),
        api.get('/admin/circuit-breaker'),
      ])

      if (configRes.status === 'fulfilled') {
        const rawConfig = configRes.value.data
        let list = []
        if (Array.isArray(rawConfig)) {
          list = rawConfig
        } else if (rawConfig && typeof rawConfig === 'object') {
          list = rawConfig.configs || rawConfig.data || []
        }
        setConfigs(list)
      } else {
        console.warn('Failed to load configs:', configRes.reason)
        setError(configRes.reason?.response?.data?.message || configRes.reason?.message || 'Failed to load configs')
      }

      if (cbRes.status === 'fulfilled') {
        setCircuitBreaker(cbRes.value.data)
      } else {
        console.warn('Circuit breaker status unavailable:', cbRes.reason)
      }
    } catch (err) {
      console.error('Failed to load settings data:', err)
      setError(err.message || 'Error loading settings')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCircuitBreaker = async () => {
    try {
      setCbLoading(true)
      const res = await api.get('/admin/circuit-breaker')
      setCircuitBreaker(res.data)
    } catch (err) {
      console.error('Failed to refresh circuit breaker:', err)
    } finally {
      setCbLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Normalizing circuit breaker info
  const cbState = (circuitBreaker?.state || circuitBreaker?.status || 'CLOSED').toUpperCase()
  const failureCount = circuitBreaker?.failureCount ?? circuitBreaker?.failures ?? circuitBreaker?.failure_count ?? 0
  const threshold = circuitBreaker?.threshold ?? circuitBreaker?.failureThreshold ?? circuitBreaker?.failure_threshold ?? 5
  const resetTimeout = circuitBreaker?.resetTimeout ?? circuitBreaker?.timeout ?? circuitBreaker?.reset_timeout_ms ?? 30000

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gateway Settings & Policies</h1>
        <p className="text-sm text-gray-500">
          Tune rate limiting algorithms, threshold policies, and inspect resilience circuit breaker status
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold">Settings Error</p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={fetchSettings}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-medium rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Circuit Breaker Status Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h2 className="text-base font-semibold text-gray-900">Circuit Breaker Protection</h2>
          </div>
          <button
            type="button"
            onClick={fetchCircuitBreaker}
            disabled={cbLoading}
            className="text-xs px-2.5 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded text-gray-700 font-medium transition-colors"
          >
            {cbLoading ? 'Checking...' : 'Refresh Status'}
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Indicator */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1">
                State
              </span>
              <div className="flex items-center space-x-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    cbState === 'CLOSED'
                      ? 'bg-emerald-500 ring-2 ring-emerald-200'
                      : cbState === 'HALF_OPEN'
                      ? 'bg-amber-500 ring-2 ring-amber-200'
                      : 'bg-red-500 ring-2 ring-red-200 animate-pulse'
                  }`}
                />
                <span className="text-lg font-bold text-gray-900 capitalize">
                  {cbState.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {cbState === 'CLOSED'
                  ? 'Healthy - Normal routing'
                  : cbState === 'HALF_OPEN'
                  ? 'Recovery trial mode'
                  : 'Tripped - Upstream failing'}
              </p>
            </div>

            {/* Failure Count */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1">
                Consecutive Failures
              </span>
              <p className="text-2xl font-bold text-gray-900">
                {failureCount} <span className="text-xs text-gray-400 font-normal">/ {threshold}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">Triggers open if threshold is met</p>
            </div>

            {/* Failure Threshold */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1">
                Failure Threshold
              </span>
              <p className="text-2xl font-bold text-gray-900">{threshold}</p>
              <p className="text-xs text-gray-500 mt-1">Consecutive errors to trip breaker</p>
            </div>

            {/* Reset Timeout */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1">
                Reset Timeout
              </span>
              <p className="text-2xl font-bold text-gray-900">
                {typeof resetTimeout === 'number' && resetTimeout > 1000
                  ? `${resetTimeout / 1000}s`
                  : `${resetTimeout}ms`}
              </p>
              <p className="text-xs text-gray-500 mt-1">Cooldown before trial reset</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rate Limit Configuration Table Editor */}
      <div>
        {loading && configs.length === 0 ? (
          <div className="bg-white rounded-lg p-6 border border-gray-200 animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-100 rounded w-1/3"></div>
            <div className="h-48 bg-gray-50 rounded"></div>
          </div>
        ) : (
          <ConfigEditor configs={configs} onUpdate={fetchSettings} />
        )}
      </div>
    </div>
  )
}
