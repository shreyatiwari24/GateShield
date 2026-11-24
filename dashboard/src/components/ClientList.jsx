import React, { useState } from 'react'
import axios from '../api'

export default function ClientList({ clients = [], onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [algorithm, setAlgorithm] = useState('token_bucket')
  const [maxRequests, setMaxRequests] = useState('100')
  const [windowSeconds, setWindowSeconds] = useState('60')
  const [bucketCapacity, setBucketCapacity] = useState('10')
  const [refillRate, setRefillRate] = useState('1')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [generatedKeyInfo, setGeneratedKeyInfo] = useState(null)
  const [copied, setCopied] = useState(false)
 


  const handleCreateClient = async (e) => {
    e.preventDefault()
    setCreateError(null)

    if (!name.trim()) {
      setCreateError('Client name is required')
      return
    }

    const capacity = Number(bucketCapacity)
    const refill = Number(refillRate)
    const requests = Number(maxRequests)
    const windowTime = Number(windowSeconds)

    if (
      algorithm === 'token_bucket' &&
      (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(refill) || refill <= 0)
    ) {
      setCreateError('Capacity must be a positive integer and refill rate must be greater than 0')
      return
    }

    if (
      algorithm !== 'token_bucket' &&
      (!Number.isInteger(requests) || requests < 1 ||
       !Number.isInteger(windowTime) || windowTime < 1)
    ) {
      setCreateError('Max requests and window seconds must be positive integers')
      return
    }

    setIsCreating(true)

    try {
      const payload = {
        name: name.trim(),
        route_pattern: '*',
        algorithm,
        max_requests: algorithm === 'token_bucket' ? 100 : requests,
        window_seconds: algorithm === 'token_bucket' ? 60 : windowTime,
        bucket_capacity: algorithm === 'token_bucket' ? capacity : 10,
        refill_rate: algorithm === 'token_bucket' ? refill : 1,
      }

      const response = await api.post('/admin/clients', payload)
      const data = response.data || {}

      const apiKey = data.api_key || data.apiKey || data.key || ''

      setGeneratedKeyInfo({
        name: name.trim(),
        key: apiKey || 'Key not returned by server',
      })

      setName('')
      setAlgorithm('token_bucket')
      setMaxRequests('100')
      setWindowSeconds('60')
      setBucketCapacity('10')
      setRefillRate('1')
      setShowForm(false)

      if (onRefresh) onRefresh()
    } catch (err) {
      setCreateError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to create client'
      )
    } finally {
      setIsCreating(false)
    }
  }

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(generatedKeyInfo.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCreateError('Unable to copy API key')
    }
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">API Clients</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add Client'}
        </button>
      </div>

      {generatedKeyInfo && (
        <div className="rounded-lg border border-green-500 bg-green-50 p-4 text-gray-900">
          <p className="font-semibold">Client created: {generatedKeyInfo.name}</p>
          <p className="mt-2 text-sm">Save this API key. It may not be shown again.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all">{generatedKeyInfo.key}</code>
            <button onClick={copyKey} className="rounded bg-gray-200 px-3 py-1">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setGeneratedKeyInfo(null)}
            className="mt-3 text-sm text-blue-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateClient} className="space-y-4 rounded-lg border p-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Client Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter client name"
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Rate Limiting Algorithm</label>
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              className="w-full rounded border p-2"
            >
              <option value="token_bucket">Token Bucket</option>
              <option value="fixed_window">Fixed Window</option>
              <option value="sliding_window">Sliding Window</option>
            </select>
          </div>

          {algorithm === 'token_bucket' ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Bucket Capacity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={bucketCapacity}
                  onChange={(e) => setBucketCapacity(e.target.value)}
                  className="w-full rounded border p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Refill Rate (tokens/second)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={refillRate}
                  onChange={(e) => setRefillRate(e.target.value)}
                  className="w-full rounded border p-2"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Max Requests</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxRequests}
                  onChange={(e) => setMaxRequests(e.target.value)}
                  className="w-full rounded border p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Window (seconds)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={windowSeconds}
                  onChange={(e) => setWindowSeconds(e.target.value)}
                  className="w-full rounded border p-2"
                />
              </div>
            </>
          )}

          {createError && (
            <p className="text-sm text-red-600">{createError}</p>
          )}

          <button
            type="submit"
            disabled={isCreating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Client'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3">Client</th>
              <th className="p-3">Algorithm</th>
              <th className="p-3">Rate Limit</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const algorithm = client.algorithm || 'token_bucket'
              const limits = algorithm === 'token_bucket'
                ? `Capacity: ${client.bucket_capacity ?? 10}, Refill: ${client.refill_rate ?? 1}/s`
                : `${client.max_requests ?? 100} requests / ${client.window_seconds ?? 60}s`

              return (
                <tr key={client.id} className="border-b">
                  <td className="p-3">{client.name}</td>
                  <td className="p-3">{algorithm.replace('_', ' ')}</td>
                  <td className="p-3">{limits}</td>
                  <td className="p-3">
                    {client.is_active === false ? 'Inactive' : 'Active'}
                  </td>
                  <td className="p-3">
                    {client.created_at
                      ? new Date(client.created_at).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
