import React, { useState, useEffect, useCallback } from 'react'
import api from '../api'
import ClientList from '../components/ClientList'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get('/admin/clients')
      const rawData = response.data
      let list = []
      if (Array.isArray(rawData)) {
        list = rawData
      } else if (rawData && typeof rawData === 'object') {
        list = rawData.clients || rawData.data || []
      }
      setClients(list)
      setError(null)
    } catch (err) {
      console.error('Failed to load clients:', err)
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Failed to load clients from the server'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Client Management</h1>
        <p className="text-sm text-gray-500">
          Manage API consumers, issue authentication credentials, and inspect client access policies
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold">Failed to Retrieve Clients</p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={fetchClients}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-medium rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton or Content */}
      {loading && clients.length === 0 ? (
        <div className="bg-white rounded-lg p-6 border border-gray-200 animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-100 rounded w-1/3"></div>
          <div className="h-48 bg-gray-50 rounded"></div>
        </div>
      ) : (
        <ClientList clients={clients} onRefresh={fetchClients} />
      )}
    </div>
  )
}
