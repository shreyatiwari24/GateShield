import React, { useState, useEffect, useCallback } from 'react'
import api from '../api'

export default function Services() {
  const [services, setServices] = useState([])
  const [health, setHealth] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', base_url: '', path_prefix: '', description: '', timeout_ms: '5000', retry_count: '0', health_endpoint: '' })
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [svcRes, healthRes] = await Promise.allSettled([
        api.get('/admin/services'),
        api.get('/admin/services/health'),
      ])
      if (svcRes.status === 'fulfilled') setServices(svcRes.value.data || [])
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const getHealthForService = (id) => health.find(h => h.id === id)

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await api.post('/admin/services', {
        ...form,
        timeout_ms: parseInt(form.timeout_ms, 10) || 5000,
        retry_count: parseInt(form.retry_count, 10) || 0,
      })
      setSuccess('Service created')
      setShowForm(false)
      setForm({ name: '', base_url: '', path_prefix: '', description: '', timeout_ms: '5000', retry_count: '0', health_endpoint: '' })
      fetchData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create service')
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Disable service "${name}"?`)) return
    try {
      await api.delete(`/admin/services/${id}`)
      setSuccess(`Service "${name}" disabled`)
      fetchData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disable service')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backend Services</h1>
          <p className="text-sm text-gray-500">Dynamic service registry and health monitoring</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">Refresh</button>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ Add Service'}
          </button>
        </div>
      </div>

      {success && <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded">{success}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg border border-blue-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Service Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g. Products API" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Base URL</label>
              <input value={form.base_url} onChange={e => setForm({...form, base_url: e.target.value})} required
                className="w-full px-3 py-2 border rounded-md text-sm" placeholder="http://backend:4000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Path Prefix</label>
              <input value={form.path_prefix} onChange={e => setForm({...form, path_prefix: e.target.value})} required
                className="w-full px-3 py-2 border rounded-md text-sm" placeholder="/api/products" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Timeout (ms)</label>
              <input type="number" value={form.timeout_ms} onChange={e => setForm({...form, timeout_ms: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Health Endpoint (optional)</label>
              <input value={form.health_endpoint} onChange={e => setForm({...form, health_endpoint: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g. /health or /status" />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Create Service</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-6 py-3 text-left">Service</th>
              <th className="px-6 py-3 text-left">URL</th>
              <th className="px-6 py-3 text-left">Path</th>
              <th className="px-6 py-3 text-left">Health</th>
              <th className="px-6 py-3 text-left">Timeout</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {services.map(svc => {
              const h = getHealthForService(svc.id)
              return (
                <tr key={svc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{svc.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-600">{svc.base_url}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-600">{svc.path_prefix}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      h?.health_status === 'healthy' ? 'bg-green-100 text-green-800' :
                      h?.health_status === 'unhealthy' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {h?.health_status || 'pending'}
                    </span>
                    {h?.response_time_ms != null && <span className="text-xs text-gray-400 ml-1">{h.response_time_ms}ms</span>}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">{svc.timeout_ms}ms</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      svc.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>{svc.is_active ? 'Active' : 'Disabled'}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {svc.is_active && (
                      <button onClick={() => handleDelete(svc.id, svc.name)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">Disable</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {services.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No services registered</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
