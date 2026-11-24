import React, { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Settings from './pages/Settings'
import Services from './pages/Services'
import Analytics from './pages/Analytics'
import AuditLogs from './pages/AuditLogs'

export default function App() {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gs_admin_user')) } catch { return null }
  })
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    const onLogout = () => setAdmin(null)
    window.addEventListener('gs_logout', onLogout)
    return () => window.removeEventListener('gs_logout', onLogout)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('gs_admin_token')
    localStorage.removeItem('gs_admin_user')
    setAdmin(null)
  }

  if (!admin) return <Login onLogin={setAdmin} />

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'clients', label: 'Clients' },
    { id: 'services', label: 'Services' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' },
    { id: 'audit', label: 'Audit Logs' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-gray-900">GateShield</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 ml-2">Gateway Monitor</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <nav className="hidden md:flex space-x-1">
                {tabs.map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === tab.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}>{tab.label}</button>
                ))}
              </nav>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <span className="hidden sm:inline">{admin.username}</span>
                <button onClick={handleLogout} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium">Logout</button>
              </div>
            </div>
          </div>
          {/* Mobile nav */}
          <div className="md:hidden flex space-x-1 pb-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-500'
                }`}>{tab.label}</button>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'clients' && <Clients />}
        {activeTab === 'services' && <Services />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'audit' && <AuditLogs />}
      </main>
      <footer className="bg-white border-t border-gray-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-500">
          GateShield API Gateway &bull; Real-time Traffic Monitoring
        </div>
      </footer>
    </div>
  )
}
