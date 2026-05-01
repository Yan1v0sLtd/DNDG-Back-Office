import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { EnvironmentProvider } from '@/contexts/EnvironmentContext';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { HeroesList } from '@/pages/HeroesList';
import { HeroEditor } from '@/pages/HeroEditor';
import { CoefficientsAdmin } from '@/pages/admin/Coefficients';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <EnvironmentProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected />}>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/heroes" replace />} />
                <Route path="/heroes" element={<HeroesList />} />
                <Route path="/heroes/:id" element={<HeroEditor />} />
                <Route path="/admin/coefficients" element={<CoefficientsAdmin />} />
                <Route path="*" element={<Navigate to="/heroes" replace />} />
              </Route>
            </Route>
          </Routes>
        </EnvironmentProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function Protected() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
