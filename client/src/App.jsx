import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';
import ClientLayout from './components/layout/ClientLayout';
import PrintLayout from './components/layout/PrintLayout';

import Login from './pages/Login';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminClients from './pages/admin/Clients';
import AdminClientDetail from './pages/admin/ClientDetail';
import AdminClientForm from './pages/admin/ClientForm';
import AdminTimeTracking from './pages/admin/TimeTracking';
import AdminTasks from './pages/admin/Tasks';
import AdminInvoices from './pages/admin/Invoices';
import AdminInvoiceCreate from './pages/admin/InvoiceCreate';
import AdminInvoiceDetail from './pages/admin/InvoiceDetail';
import AdminDocuments from './pages/admin/Documents';
import AdminMessages from './pages/admin/Messages';
import AdminReports from './pages/admin/Reports';
import AdminSettings from './pages/admin/Settings';

// 3D print shop pages
import PrintDashboard from './pages/print/Dashboard';
import PrintOrders from './pages/print/Orders';
import PrintCatalog from './pages/print/Catalog';
import PrintFilament from './pages/print/Filament';
import PrintMaterials from './pages/print/Materials';
import PrintQueue from './pages/print/Queue';
import PrintSettings from './pages/print/Settings';

// Client pages
import ClientDashboard from './pages/client/Dashboard';
import ClientInvoices from './pages/client/Invoices';
import ClientInvoiceDetail from './pages/client/InvoiceDetail';
import ClientDocuments from './pages/client/Documents';
import ClientMessages from './pages/client/Messages';
import ClientProfile from './pages/client/Profile';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Admin portal */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="clients/new" element={<AdminClientForm />} />
            <Route path="clients/:id" element={<AdminClientDetail />} />
            <Route path="clients/:id/edit" element={<AdminClientForm />} />
            <Route path="time" element={<AdminTimeTracking />} />
            <Route path="tasks" element={<AdminTasks />} />
            <Route path="invoices" element={<AdminInvoices />} />
            <Route path="invoices/new" element={<AdminInvoiceCreate />} />
            <Route path="invoices/:id" element={<AdminInvoiceDetail />} />
            <Route path="documents" element={<AdminDocuments />} />
            <Route path="messages" element={<AdminMessages />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          {/* 3D print shop */}
          <Route
            path="/print"
            element={
              <ProtectedRoute role="admin">
                <PrintLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PrintDashboard />} />
            <Route path="orders" element={<PrintOrders />} />
            <Route path="catalog" element={<PrintCatalog />} />
            <Route path="filament" element={<PrintFilament />} />
            <Route path="materials" element={<PrintMaterials />} />
            <Route path="queue" element={<PrintQueue />} />
            <Route path="settings" element={<PrintSettings />} />
          </Route>

          {/* Client portal */}
          <Route
            path="/client"
            element={
              <ProtectedRoute role="client">
                <ClientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ClientDashboard />} />
            <Route path="invoices" element={<ClientInvoices />} />
            <Route path="invoices/:id" element={<ClientInvoiceDetail />} />
            <Route path="documents" element={<ClientDocuments />} />
            <Route path="messages" element={<ClientMessages />} />
            <Route path="profile" element={<ClientProfile />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
