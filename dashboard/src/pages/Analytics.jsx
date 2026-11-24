import React, { useState, useEffect, useCallback } from 'react'
import api from '../api'

export default function Analytics() {
  const [data, setData] = useState(null)
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get(`/admin/analytics?hours=${hours}`)
      setData(res.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [hours])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Advanced Analytics</h1>
          <p className="text-sm text-gray-500">Traffic patterns, per-service breakdown, and error rates</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={hours} onChange={e => setHours(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
          <button onClick={fetchData} className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">Refresh</button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">{error}</div>}

      {loading && !data ? (
        <div className="bg-white rounded-lg p-6 border border-gray-200 animate-pulse h-64" />
      ) : data && (
        <>
          {/* Per-Service Stats */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Per-Service Breakdown</h2>
              <p className="text-xs text-gray-500">Request volume, success rate, and response times by backend service</p>
            </div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">Service</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">Allowed</th>
                  <th className="px-6 py-3 text-right">Blocked</th>
                  <th className="px-6 py-3 text-right">Avg Response</th>
                  <th className="px-6 py-3 text-right">P95 Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(data.per_service || []).map((svc, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{svc.service_name}</td>
                    <td className="px-6 py-4 text-right font-mono">{svc.total}</td>
                    <td className="px-6 py-4 text-right font-mono text-green-600">{svc.allowed}</td>
                    <td className="px-6 py-4 text-right font-mono text-red-600">{svc.blocked}</td>
                    <td className="px-6 py-4 text-right font-mono">{svc.avg_response_ms || 0}ms</td>
                    <td className="px-6 py-4 text-right font-mono">{svc.p95_response_ms || 0}ms</td>
                  </tr>
                ))}
                {(!data.per_service || data.per_service.length === 0) && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Top Clients */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Top Clients by Volume</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">Client</th>
                  <th className="px-6 py-3 text-right">Requests</th>
                  <th className="px-6 py-3 text-right">Allowed</th>
                  <th className="px-6 py-3 text-right">Blocked</th>
                  <th className="px-6 py-3 text-right">Block Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(data.top_clients || []).map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{c.name}</td>
                    <td className="px-6 py-4 text-right font-mono">{c.total_requests}</td>
                    <td className="px-6 py-4 text-right font-mono text-green-600">{c.allowed}</td>
                    <td className="px-6 py-4 text-right font-mono text-red-600">{c.blocked}</td>
                    <td className="px-6 py-4 text-right font-mono">
                      {c.total_requests > 0 ? ((c.blocked / c.total_requests) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Status Code Distribution */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Status Code Distribution</h2>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {(data.status_codes || []).map((s, i) => (
                <div key={i} className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${
                    s.status_code >= 200 && s.status_code < 300 ? 'text-green-600' :
                    s.status_code === 429 ? 'text-amber-600' :
                    s.status_code >= 400 ? 'text-red-600' : 'text-gray-600'
                  }`}>{s.status_code}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.count} requests</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hourly Traffic */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Hourly Traffic</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Hour</th>
                    <th className="px-6 py-3 text-right">Total</th>
                    <th className="px-6 py-3 text-right">Allowed</th>
                    <th className="px-6 py-3 text-right">Blocked</th>
                    <th className="px-6 py-3 text-right">Avg Response</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(data.hourly || []).slice(0, 24).map((h, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-mono text-xs text-gray-600">
                        {new Date(h.hour).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-3 text-right font-mono">{h.total}</td>
                      <td className="px-6 py-3 text-right font-mono text-green-600">{h.allowed}</td>
                      <td className="px-6 py-3 text-right font-mono text-red-600">{h.blocked}</td>
                      <td className="px-6 py-3 text-right font-mono">{h.avg_response_ms || 0}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
