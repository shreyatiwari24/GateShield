import React, { useState, useEffect, useCallback } from 'react'
import api from '../api'

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState({ action: '', entity_type: '' })

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ limit: '100' })
      if (filter.action) params.set('action', filter.action)
      if (filter.entity_type) params.set('entity_type', filter.entity_type)
      const res = await api.get(`/admin/audit-logs?${params}`)
      setLogs(res.data || [])
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const actionColors = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    ROTATE: 'bg-amber-100 text-amber-800',
    REVOKE: 'bg-red-100 text-red-800',
    ACTIVATE: 'bg-green-100 text-green-800',
    DEACTIVATE: 'bg-gray-100 text-gray-800',
    GRANT: 'bg-green-100 text-green-800',
  }

  const getActionColor = (action) => {
    for (const [key, cls] of Object.entries(actionColors)) {
      if (action.toUpperCase().includes(key)) return cls
    }
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500">Complete record of all administrative actions</p>
        </div>
        <button onClick={fetchLogs} className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">Refresh</button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">{error}</div>}

      <div className="flex gap-3">
        <input value={filter.action} onChange={e => setFilter({...filter, action: e.target.value})}
          placeholder="Filter by action..." className="px-3 py-2 border rounded-md text-sm w-48" />
        <select value={filter.entity_type} onChange={e => setFilter({...filter, entity_type: e.target.value})}
          className="px-3 py-2 border rounded-md text-sm bg-white">
          <option value="">All entity types</option>
          <option value="api_client">API Client</option>
          <option value="backend_service">Backend Service</option>
          <option value="rate_limit_config">Rate Limit Config</option>
          <option value="permission">Permission</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-6 py-3 text-left">Time</th>
              <th className="px-6 py-3 text-left">Admin</th>
              <th className="px-6 py-3 text-left">Action</th>
              <th className="px-6 py-3 text-left">Entity</th>
              <th className="px-6 py-3 text-left">Details</th>
              <th className="px-6 py-3 text-left">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 whitespace-nowrap text-xs font-mono text-gray-600">
                  {new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td className="px-6 py-3 whitespace-nowrap font-medium text-gray-900">
                  {log.admin_username || 'system'}
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-600">
                  {log.entity_type && <span>{log.entity_type} #{log.entity_id}</span>}
                </td>
                <td className="px-6 py-3 text-xs text-gray-600 max-w-xs truncate">
                  {log.details ? JSON.stringify(log.details) : '—'}
                </td>
                <td className="px-6 py-3 whitespace-nowrap font-mono text-xs text-gray-500">{log.ip_address || '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No audit logs found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
