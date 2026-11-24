import React from 'react'

const colorClasses = {
  blue: {
    border: 'border-t-blue-500',
    text: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  green: {
    border: 'border-t-green-500',
    text: 'text-green-600',
    bg: 'bg-green-50',
  },
  red: {
    border: 'border-t-red-500',
    text: 'text-red-600',
    bg: 'bg-red-50',
  },
  yellow: {
    border: 'border-t-amber-500',
    text: 'text-amber-600',
    bg: 'bg-amber-50',
  },
}

export default function StatsCard({ title, value, subtitle, color = 'blue' }) {
  const scheme = colorClasses[color] || colorClasses.blue

  const formattedValue =
    typeof value === 'number'
      ? value.toLocaleString()
      : value !== null && value !== undefined
      ? String(value)
      : '0'

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 border-t-4 ${scheme.border} p-6 flex flex-col justify-between transition-shadow hover:shadow`}
    >
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </p>
        <p className="text-3xl font-extrabold text-gray-900 mt-2">
          {formattedValue}
        </p>
      </div>
      {subtitle && (
        <div className="mt-4 pt-3 border-t border-gray-100 text-sm text-gray-500 flex items-center">
          {subtitle}
        </div>
      )}
    </div>
  )
}
