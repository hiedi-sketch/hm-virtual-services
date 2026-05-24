import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import ClientSidebar from './ClientSidebar';

export default function ClientLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-linen">
      <ClientSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
