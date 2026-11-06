import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AmpLogo } from './AmpLogo';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden flex flex-col md:flex-row bg-page-bg text-text-main">
      {/* Top Bar for Mobile (< 768px) */}
      <header className="md:hidden bg-maroon text-white px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <AmpLogo />
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight truncate">
              Call Tracker
            </div>
            {user?.fullName && (
              <div className="text-xs text-white/80 truncate">
                {user.fullName}
              </div>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <NavLink
            to="/dashboard"
            title="Dashboard"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-white/18 text-white' : 'text-white/85 hover:bg-white/10'
              }`
            }
          >
            <LayoutDashboard size={18} />
            <span className="hidden sm:inline">Dashboard</span>
          </NavLink>

          <NavLink
            to="/settings"
            title="Settings"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-white/18 text-white' : 'text-white/85 hover:bg-white/10'
              }`
            }
          >
            <Settings size={18} />
            <span className="hidden sm:inline">Settings</span>
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white/85 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </nav>
      </header>

      {/* Left Sidebar for Desktop (>= 768px) */}
      <aside
        style={{ width: collapsed ? 72 : 236 }}
        className="hidden md:flex md:flex-col md:h-screen md:shrink-0 bg-maroon text-white transition-[width] duration-200 ease-in-out select-none"
      >
        {/* Sidebar Top: Logo, Title, User's Full Name, and Icon-Only Collapse Button */}
        <div
          className={`px-3 pt-4 pb-4 border-b border-white/12 flex items-center ${
            collapsed ? 'flex-col gap-3 justify-center' : 'justify-between gap-2'
          }`}
        >
          <div className={`flex items-center min-w-0 ${collapsed ? 'justify-center' : 'gap-2.5 flex-1'}`}>
            <AmpLogo />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight text-white truncate">
                  Call Tracker
                </div>
                {user?.fullName && (
                  <div className="text-xs text-white/75 mt-0.5 truncate">
                    {user.fullName}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/12 transition-colors shrink-0 cursor-pointer"
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>

        {/* Navigation Item: Dashboard */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavLink
            to="/dashboard"
            title={collapsed ? 'Dashboard' : undefined}
            className={({ isActive }) =>
              `flex items-center ${
                collapsed ? 'justify-center px-0' : 'gap-3 px-3'
              } h-11 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-white/18 text-white' : 'text-white/85 hover:bg-white/10'
              }`
            }
          >
            <LayoutDashboard size={19} className="shrink-0" />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </NavLink>
        </div>

        {/* Bottom Actions: Settings & Sign out */}
        <div className="px-3 py-4 border-t border-white/12 space-y-1 shrink-0">
          <NavLink
            to="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={({ isActive }) =>
              `flex items-center ${
                collapsed ? 'justify-center px-0' : 'gap-3 px-3'
              } h-11 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-white/18 text-white' : 'text-white/85 hover:bg-white/10'
              }`
            }
          >
            <Settings size={19} className="shrink-0" />
            {!collapsed && <span className="truncate">Settings</span>}
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? 'Sign out' : undefined}
            className={`w-full flex items-center ${
              collapsed ? 'justify-center px-0' : 'gap-3 px-3'
            } h-11 rounded-lg text-sm font-medium text-white/85 hover:bg-white/10 transition-colors cursor-pointer`}
          >
            <LogOut size={19} className="shrink-0" />
            {!collapsed && <span className="truncate">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area (scrolls independently on desktop) */}
      <main className="flex-1 min-w-0 md:h-screen md:overflow-y-auto bg-page-bg">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
