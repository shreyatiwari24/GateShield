
import React, { useState, useEffect, useRef } from 'react'
import api from '../api'
import StatsCard from '../components/StatsCard'
import ActivityTable from '../components/ActivityTable'

const getNumber = (value) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const getErrorMessage = (err) => {
  const rawError =
    err.response?.data?.message ??
    err.response?.data?.error

  if (typeof rawError === 'string') return rawError
  if (typeof rawError?.message === 'string') return rawError.message
  if (typeof err.message === 'string') return err.message

  return 'Unable to connect to gateway administration service'
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    allowed: 0,
    blocked: 0,
  })

  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const isMountedRef = useRef(false)

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial && isMountedRef.current) {
        setLoading(true)
      }

      const [statsRes, activityRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/activity'),
      ])

      if (!isMountedRef.current) return

      const s = statsRes.data || {}

      const total = getNumber(
        s.totalRequests ?? s.total_requests ?? s.total ?? s.requests?.total
      )

      const allowed = getNumber(
        s.allowedRequests ?? s.allowed_requests ?? s.allowed ?? s.requests?.allowed
      )

      const blocked = getNumber(
        s.blockedRequests ?? s.blocked_requests ?? s.blocked ?? s.requests?.blocked
      )

      setStats({ total, allowed, blocked })

      const rawActivity = activityRes.data

      let actList = []

      if (Array.isArray(rawActivity)) {
        actList = rawActivity
      } else if (rawActivity && typeof rawActivity === 'object') {
        const possibleList =
          rawActivity.activity ??
          rawActivity.activities ??
          rawActivity.logs ??
          []

        actList = Array.isArray(possibleList) ? possibleList : []
      }

      setActivity(actList)

      setError(null)
      setLastRefreshed(new Date())

    } catch (err) {
      if (!isMountedRef.current) return

      console.error('Failed to fetch dashboard data:', err)

      if (isInitial || !lastRefreshed) {
        setError(getErrorMessage(err))
      }
    } finally {
      if (isMountedRef.current && isInitial) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true

    fetchData(true)

    const interval = setInterval(() => {
      fetchData(false)
    }, 5000)

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  const allowedPercent =
    stats.total > 0
      ? ((stats.allowed / stats.total) * 100).toFixed(1)
      : '100'

  const blockedPercent =
    stats.total > 0
      ? ((stats.blocked / stats.total) * 100).toFixed(1)
      : '0'

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Traffic & Rate Limit Monitor
          </h1>
          <p className="text-sm text-gray-500">
            Live operational metrics and recent gateway request flow
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs text-gray-500">
          <span className="flex items-center space-x-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span>Live auto-refresh (5s)</span>
          </span>

          {lastRefreshed && (
            <span className="hidden sm:inline-block text-gray-400">
              &bull; Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}

          <button
            type="button"
            onClick={() => fetchData(false)}
            className="px-2.5 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>

            <div>
              <p className="text-sm font-semibold">
                Error Loading Dashboard Data
              </p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchData(true)}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-medium rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-lg p-6 border border-gray-200 animate-pulse h-32"
              >
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200 animate-pulse h-64">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-40 bg-gray-100 rounded"></div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatsCard
              title="Total Requests"
              value={stats.total}
              subtitle="Total gateway requests received"
              color="blue"
            />

            <StatsCard
              title="Allowed"
              value={stats.allowed}
              subtitle={`${allowedPercent}% of requests passed`}
              color="green"
            />

            <StatsCard
              title="Blocked"
              value={stats.blocked}
              subtitle={`${blockedPercent}% rate limited or throttled`}
              color="red"
            />
          </div>

          {/* Activity Table */}
          <ActivityTable activities={activity} />
        </>
      )}
    </div>
  )
}
