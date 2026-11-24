
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.API_URL || '',
})
// Attach JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gs_admin_token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Auto-redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login')
    ) {
      localStorage.removeItem('gs_admin_token')
      localStorage.removeItem('gs_admin_user')
      window.dispatchEvent(new Event('gs_logout'))
    }

    return Promise.reject(error)
  }
)

export default api
