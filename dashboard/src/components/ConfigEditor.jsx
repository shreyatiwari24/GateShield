import React, { useState } from 'react'
import axios from '../api'

export default function ConfigEditor({ configs = [], onUpdate }) {
  const [editingId, setEditingId] = useState(null)
  const [editFormData, setEditFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [deactivatingId, setDeactivatingId] = useState(null)

  const handleEditClick = (config) => {
    setEditingId(config.id)
    setEditFormData({
      algorithm: config.algorithm || 'token_bucket',
      max_requests: config.max_requests ?? 100,
      window_seconds: config.window_seconds ?? 60,
      bucket_capacity: config.bucket_capacity ?? 10,
      refill_rate: config.refill_rate ?? 1.0,
    })
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditFormData({})
    setErrorMessage(null)
  }

  const handleInputChange = (field, value) => {
    setEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSave = async (id) => {
    setSaving(true)
    setErrorMessage(null)

    try {
      const payload = {
        algorithm: editFormData.algorithm,
        max_requests: parseInt(editFormData.max_requests, 10) || 100,
        window_seconds: parseInt(editFormData.window_seconds, 10) || 60,
        bucket_capacity: editFormData.bucket_capacity !== '' && editFormData.bucket_capacity !== null
          ? parseInt(editFormData.bucket_capacity, 10)
          : null,
        refill_rate: editFormData.refill_rate !== '' && editFormData.refill_rate !== null
          ? parseFloat(editFormData.refill_rate)
          : null,
      }

      await api.put(`/admin/config/${id}`, payload)
      setEditingId(null)
      setSuccessMessage(`Configuration for rule #${id} updated successfully`)
      setTimeout(() => setSuccessMessage(null), 3500)
      if (onUpdate) onUpdate()
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to update configuration'
      )
    } finally {
      setSaving(false)
    }
  }
  
const handleDeactivate = async (cfg) => {
  const clientId = cfg.client_id

  if (!clientId) {
    setErrorMessage('Client ID not found')
    return
  }

  if (!window.confirm(`Deactivate ${cfg.client_name}?`)) return

  try {
    setDeactivatingId(clientId)
    setErrorMessage(null)

    await api.patch(`/admin/clients/${clientId}/deactivate`)

    setSuccessMessage(`${cfg.client_name} deactivated successfully`)
    if (onUpdate) await onUpdate()
  } catch (err) {
    setErrorMessage(err.response?.data?.error || 'Failed to deactivate client')
  } finally {
    setDeactivatingId(null)
  }
}


  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Rate Limiting Policies</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure algorithm strategies and thresholds per client and route
          </p>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          {configs.length} {configs.length === 1 ? 'rule' : 'rules'}
        </span>
      </div>

      {successMessage && (
        <div className="m-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
          {errorMessage}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-6 py-3">Client Name</th>
              <th scope="col" className="px-6 py-3">Route</th>
              <th scope="col" className="px-6 py-3">Algorithm</th>
              <th scope="col" className="px-6 py-3">Limits</th>
              <th scope="col" className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {configs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No rate limit configurations found.
                </td>
              </tr>
            ) : (
              configs.map((cfg) => {
                const isEditing = editingId === cfg.id && cfg.is_active !== false
                const clientName =
                  cfg.client_name || cfg.clientName || cfg.client?.name || `Client #${cfg.client_id || cfg.id}`
                const route = cfg.route_pattern || cfg.route || '*'

                if (isEditing) {
                  return (
                    <tr key={cfg.id} className="bg-blue-50/40">
                      <td className="px-6 py-4 align-top font-semibold text-gray-900">
                        {clientName}
                        <div className="text-xs text-gray-500 font-mono">ID: {cfg.id}</div>
                      </td>
                      <td className="px-6 py-4 align-top font-mono text-xs text-gray-700">
                        {route}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <select
                          value={editFormData.algorithm}
                          onChange={(e) => handleInputChange('algorithm', e.target.value)}
                          className="px-2.5 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                          <option value="token_bucket">Token Bucket</option>
                          <option value="fixed_window">Fixed Window</option>
                          <option value="sliding_window">Sliding Window</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block text-gray-500 text-[10px] uppercase font-bold">Max Requests</label>
                            <input
                              type="number"
                              value={editFormData.max_requests}
                              onChange={(e) => handleInputChange('max_requests', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-500 text-[10px] uppercase font-bold">Window (sec)</label>
                            <input
                              type="number"
                              value={editFormData.window_seconds}
                              onChange={(e) => handleInputChange('window_seconds', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-500 text-[10px] uppercase font-bold">Bucket Capacity</label>
                            <input
                              type="number"
                              value={editFormData.bucket_capacity ?? ''}
                              onChange={(e) => handleInputChange('bucket_capacity', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                              placeholder="e.g. 10"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-500 text-[10px] uppercase font-bold">Refill Rate (/sec)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editFormData.refill_rate ?? ''}
                              onChange={(e) => handleInputChange('refill_rate', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                              placeholder="e.g. 1.0"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSave(cfg.id)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleCancel}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={cfg.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {clientName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-600">
                      {route}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                        {(cfg.algorithm || 'token_bucket').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 font-mono">
                      {cfg.algorithm === 'token_bucket' ? (
                        <span>
                          Cap: {cfg.bucket_capacity ?? 10} &bull; Refill: {cfg.refill_rate ?? 1}/s
                          <span className="text-gray-400 ml-1">
                            ({cfg.max_requests ?? 100}/{cfg.window_seconds ?? 60}s)
                          </span>
                        </span>
                      ) : (
                        <span>
                          {cfg.max_requests ?? 100} req / {cfg.window_seconds ?? 60}s
                        </span>
                      )}
                    </td>
                   <td className="px-6 py-4 whitespace-nowrap text-right">
                      {cfg.is_active === false ? (
                        <span className="text-xs font-medium text-gray-500">
                          Deactivated
                        </span>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditClick(cfg)}
                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeactivate(cfg)}
                            disabled={deactivatingId === cfg.client_id}
                            className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium disabled:opacity-50"
                          >
                            {deactivatingId === cfg.client_id ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
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
