import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, User } from './auth';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Forms from './pages/Forms';
import FormEditor from './pages/FormEditor';
import Submissions from './pages/Submissions';
import Reports from './pages/Reports';
import Documents from './pages/Documents';
import Statistics from './pages/Statistics';
import Notifications from './pages/Notifications';
import AuditLog from './pages/AuditLog';
import DeliveryQueue from './pages/DeliveryQueue';
import Settings from './pages/Settings';

function Protected({ children, roles }: { children: React.ReactNode; roles?: User['role'][] }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={loading ? <Spinner /> : user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Protected roles={['LEADER', 'DEPUTY', 'CURATOR']}><Employees /></Protected>} />
        <Route path="employees/:id" element={<Protected roles={['LEADER', 'DEPUTY', 'CURATOR']}><EmployeeDetail /></Protected>} />
        <Route path="forms" element={<Protected roles={['LEADER', 'DEPUTY']}><Forms /></Protected>} />
        <Route path="forms/new" element={<Protected roles={['LEADER', 'DEPUTY']}><FormEditor /></Protected>} />
        <Route path="forms/:id/edit" element={<Protected roles={['LEADER', 'DEPUTY']}><FormEditor /></Protected>} />
        <Route path="submissions" element={<Protected roles={['LEADER', 'DEPUTY', 'CURATOR']}><Submissions /></Protected>} />
        <Route path="reports" element={<Reports />} />
        <Route path="documents" element={<Documents />} />
        <Route path="statistics" element={<Protected roles={['LEADER', 'DEPUTY', 'CURATOR']}><Statistics /></Protected>} />
        <Route path="delivery" element={<Protected roles={['LEADER', 'DEPUTY']}><DeliveryQueue /></Protected>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="audit" element={<Protected roles={['LEADER']}><AuditLog /></Protected>} />
        <Route path="settings" element={<Protected roles={['LEADER', 'DEPUTY']}><Settings /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
