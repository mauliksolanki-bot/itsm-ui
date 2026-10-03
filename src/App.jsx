import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import Loader from './components/Loader.jsx'
import ToastHost from './components/Toast.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ChangePasswordPage from './pages/ChangePasswordPage.jsx'
import './App.css'

function AppRoutes() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <Loader />

  if (user?.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/change-password" element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />
      <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="/my-tickets/*" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="/approvals/*" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="/administration/*" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="/service-catalog/*" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="/ticket-master/*" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="/application-server/*" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <ToastHost />
      </AuthProvider>
    </BrowserRouter>
  )
}
