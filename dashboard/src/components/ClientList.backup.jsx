import React, { useState } from 'react'
import axios from 'axios'

export default function ClientList({ clients = [], onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [generatedKeyInfo, setGeneratedKeyInfo] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleCreateClient = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsCreating(true)
    setCreateError(null)

    try {
      const response = await axios.post('/admin/clients', { name: name.trim() })
      const data = response.data || {}
      const apiKey = data.apiKey || data.key || data.api_key || data.client?.apiKey || data.client?.key || (typeof data === 'string' ? data : '')

      setGeneratedKeyInfo({
        name: name.trim(),
        key: apiKey || 'Generated (check server logs if not returned)',
      })
      setName('')
      setShowForm(false)
      if (onRefresh) onRefresh()
    } catch (err) {
      setCreateError(
        err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to create client'
      )
    } finally {
      setIsCreating(false)
    }
  }

  const copyToClipboard = (text) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div className="space-y-6">
      {/* Generated API Key Banner (shown ONCE upon creation) */}
      {generatedKeyInfo && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  New API Client Created: {generatedKeyInfo.name}
                </h3>
                <p className="text-xs text-amber-700 mt-0.5">
                  Save this API key now. For security reasons, it will not be shown again!
                </p>
                <div className="mt-2 flex items-center space-x-2">
                  <code className="bg-white px-3 py-1.5 rounded border border-amber-200 text-sm font-mono text-gray-900 select-all font-semibold">
                    {generatedKeyInfo.key}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedKeyInfo.key)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition-colors shadow-sm"
                  >
                    {copied ? 'Copied!' : 'Copy Key'}
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setGeneratedKeyInfo(null)}
              className="text-amber-500 hover:text-amber-700 text-sm font-bold ml-4"
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h2 className="text-lg font-bold text-gray-900">API Clients</h2>
          <p className="text-sm text-gray-500">
            Registered services authorized to send requests through GateShield
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md text-sm font-medium transition-colors"
            >
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowForm(!showForm)
              setCreateError(null)
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors flex items-center space-x-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>{showForm ? 'Cancel' : 'Create New Client'}</span>
          </button>
        </div>
      </div>

      {/* Inline Create Form */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-blue-200 ring-1 ring-blue-500">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Register New Client</h3>
          <p className="text-xs text-gray-500 mb-4">
            Enter a descriptive name for the consumer service or application.
          </p>

          {createError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateClient} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="e.g. Mobile App Gateway, Partner Service"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isCreating}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isCreating || !name.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors shadow-sm"
            >
              {isCreating ? 'Creating...' : 'Submit & Generate Key'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setName('')
                setCreateError(null)
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Clients Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-3">Client</th>
                <th scope="col" className="px-6 py-3">Algorithm</th>
                <th scope="col" className="px-6 py-3">Limits</th>
                <th scope="col" className="px-6 py-3">Status</th>
                <th scope="col" className="px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <p className="text-sm">No clients registered yet.</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Click &ldquo;Create New Client&rdquo; above to issue an API key.
                    </p>
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  const isActive = client.is_active !== false && client.active !== false
                  const algorithm = client.algorithm || client.rate_limit_algorithm || 'token_bucket'

                  let limitsDisplay = 'Default (100 req/min)'
                  if (client.bucket_capacity !== undefined && client.bucket_capacity !== null) {
                    limitsDisplay = `Cap: ${client.bucket_capacity}, Refill: ${client.refill_rate ?? 1}/s`
                  } else if (client.max_requests) {
                    limitsDisplay = `${client.max_requests} req / ${client.window_seconds || 60}s`
                  }

                  const formattedDate = client.created_at
                    ? new Date(client.created_at).toLocaleDateString([], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '-'

                  return (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-900">{client.name}</div>
                        <div className="text-xs text-gray-500 font-mono">ID: {client.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 capitalize">
                          {algorithm.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-mono text-xs">
                        {limitsDisplay}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {formattedDate}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
