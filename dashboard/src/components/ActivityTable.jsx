import React from 'react'

function formatTimestamp(timestamp) {
  if (!timestamp) return '-'
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      return String(timestamp)
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' ' +
      date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return String(timestamp)
  }
}

export default function ActivityTable({ activities = [] }) {
  const displayActivities = Array.isArray(activities) ? activities.slice(0, 20) : []

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Recent Gateway Activity</h2>
          <p className="text-xs text-gray-500 mt-0.5">Real-time log of the latest 20 incoming requests</p>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          {displayActivities.length} {displayActivities.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-6 py-3">Time</th>
              <th scope="col" className="px-6 py-3">Client</th>
              <th scope="col" className="px-6 py-3">Route</th>
              <th scope="col" className="px-6 py-3">Method</th>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Allowed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {displayActivities.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 text-sm">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>No activity yet</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayActivities.map((item, index) => {
                const isAllowed = item.allowed !== undefined
                  ? Boolean(item.allowed)
                  : (item.status_code ? item.status_code < 400 : item.status ? item.status < 400 : true)

                const clientLabel = item.client_name || item.client || (item.client_id ? `Client #${item.client_id}` : 'Anonymous')
                const route = item.route || item.path || '/'
                const method = (item.method || 'GET').toUpperCase()
                const statusCode = item.status_code || item.status || (isAllowed ? 200 : 429)
                const time = item.created_at || item.timestamp || item.time

                return (
                  <tr key={item.id || index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5 whitespace-nowrap text-gray-600 font-mono text-xs">
                      {formatTimestamp(time)}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap font-medium text-gray-900">
                      {clientLabel}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap font-mono text-xs text-gray-700">
                      {route}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                        method === 'GET' ? 'bg-blue-100 text-blue-800' :
                        method === 'POST' ? 'bg-emerald-100 text-emerald-800' :
                        method === 'PUT' ? 'bg-amber-100 text-amber-800' :
                        method === 'DELETE' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {method}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <span className={`font-mono text-xs font-semibold ${
                        statusCode >= 200 && statusCode < 300 ? 'text-green-600' :
                        statusCode === 429 ? 'text-red-600' :
                        statusCode >= 400 ? 'text-amber-600' : 'text-gray-600'
                      }`}>
                        {statusCode}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      {isAllowed ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Allowed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Blocked
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
