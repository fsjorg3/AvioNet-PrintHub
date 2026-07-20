import { Navigate, Route, Routes } from 'react-router';
import { ProtectedRoute } from './auth';
import { AppLayout } from './components/AppLayout';
import { ConsumablesPage } from './pages/ConsumablesPage';
import { DashboardPage } from './pages/DashboardPage';
import { KioskDetailPage } from './pages/KioskDetailPage';
import { KiosksPage } from './pages/KiosksPage';
import { LoginPage } from './pages/LoginPage';
import { PendingPrintsPage } from './pages/PendingPrintsPage';
import { PrintJobDetailPage } from './pages/PrintJobDetailPage';
import { PrintJobsPage } from './pages/PrintJobsPage';

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/kiosks" element={<KiosksPage />} />
        <Route path="/kiosks/:id" element={<KioskDetailPage />} />
        <Route path="/pending-prints" element={<PendingPrintsPage />} />
        <Route path="/print-jobs" element={<PrintJobsPage />} />
        <Route path="/print-jobs/:id" element={<PrintJobDetailPage />} />
        <Route path="/consumables" element={<ConsumablesPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
