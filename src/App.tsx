import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, ProtectedRoute } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NouveauDevis from './pages/NouveauDevis'
import DetailDevis from './pages/DetailDevis'
import Clients from './pages/Clients'
import SuiviRelances from './pages/SuiviRelances'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/devis/nouveau" element={<NouveauDevis />} />
            <Route path="/devis/:id" element={<DetailDevis />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/relances" element={<SuiviRelances />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
