import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { EnvironmentProvider } from '@/contexts/EnvironmentContext';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { HeroesList } from '@/pages/HeroesList';
import { HeroEditor } from '@/pages/HeroEditor';
import { CardsList } from '@/pages/CardsList';
import { CardEditor } from '@/pages/CardEditor';
import { Simulator } from '@/pages/Simulator';
import { Sweep } from '@/pages/Sweep';
import { History } from '@/pages/History';
import { HistoryCompare } from '@/pages/HistoryCompare';
import { Formulas } from '@/pages/Formulas';
import { CoefficientsAdmin } from '@/pages/admin/Coefficients';
import { BudgetsAdmin } from '@/pages/admin/Budgets';
import { CatalogAdmin } from '@/pages/admin/Catalog';
import { RecalibrateAdmin } from '@/pages/admin/Recalibrate';

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
                <Route path="/cards" element={<CardsList />} />
                <Route path="/cards/:id" element={<CardEditor />} />
                <Route path="/simulator" element={<Simulator />} />
                <Route path="/sweep" element={<Sweep />} />
                <Route path="/history" element={<History />} />
                <Route path="/history/compare" element={<HistoryCompare />} />
                <Route path="/docs/formulas" element={<Formulas />} />
                <Route path="/admin/coefficients" element={<CoefficientsAdmin />} />
                <Route path="/admin/budgets" element={<BudgetsAdmin />} />
                <Route path="/admin/catalog" element={<CatalogAdmin />} />
                <Route path="/admin/recalibrate" element={<RecalibrateAdmin />} />
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
