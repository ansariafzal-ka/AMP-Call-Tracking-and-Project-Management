import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  LogOut,
  Target,
  Contact,
  FolderKanban,
  CalendarClock,
  PhoneCall,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AmpLogo } from './AmpLogo';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = user?.role === 'admin';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navLinks = isAdmin
    ? [
        { to: '/admin/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
        { to: '/admin/calls', label: 'Team Call Logs', icon: PhoneCall },
        { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
        { to: '/admin/contacts', label: 'Contacts Database', icon: Contact },
        { to: '/admin/performance', label: 'Coordinator Performance', icon: TrendingUp },
        { to: '/admin/users', label: 'User Management', icon: Target },
      ]
    : [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/contacts', label: 'My Contacts', icon: Contact },
        { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
      ];

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden flex flex-col md:flex-row bg-page-bg text-text-main">
      {/* Top Bar for Mobile (< 768px) */}
      <header className="md:hidden bg-maroon text-white px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <AmpLogo white={true} className="h-5.5 w-auto" />
          <div className="flex items-center gap-1.5">
            <span className="text-base font-semibold leading-tight truncate">Call Tracker</span>
            {isAdmin && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase bg-[#C9A04A] text-white tracking-wider">
                ADMIN
              </span>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                title={link.label}
                className={({ isActive }) =>
                  `flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${isActive ? 'bg-white/18 text-white' : 'text-white/85 hover:bg-white/10'
                  }`
                }
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{link.label}</span>
              </NavLink>
            );
          })}

          <NavLink
            to="/settings"
            title="Settings"
            className={({ isActive }) =>
              `flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${isActive ? 'bg-white/18 text-white' : 'text-white/85 hover:bg-white/10'
              }`
            }
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Settings</span>
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/85 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </nav>
      </header>

      {/* Left Sidebar for Desktop (>= 768px, Maroon #7A1424 matching Figma) */}
      <aside
        style={{ width: collapsed ? 72 : 260 }}
        className="hidden md:flex md:flex-col md:h-screen md:shrink-0 bg-maroon text-white transition-[width] duration-200 ease-in-out select-none"
      >
        {/* Sidebar Top: Logo, Title, Role Badge, and Collapse Button */}
        <div
          className={`px-3.5 pt-4 pb-4 border-b border-white/12 flex items-center ${
            collapsed ? 'flex-col gap-3 justify-center' : 'justify-between gap-2.5'
          }`}
        >
          <div className={`flex items-center min-w-0 ${collapsed ? 'justify-center' : 'gap-2.5 flex-1'}`}>
            <AmpLogo white={true} className="h-6 w-auto" />
            {!collapsed && (
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-[15px] font-bold leading-tight text-white tracking-tight">
                  Call Tracker
                </span>
                {isAdmin && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-[#C9A04A] text-white tracking-wider leading-none shadow-xs">
                    ADMIN
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/75 hover:text-white hover:bg-white/12 transition-colors shrink-0 cursor-pointer"
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>

        {/* Navigation Items (Role-aware) */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                title={collapsed ? link.label : undefined}
                className={({ isActive }) =>
                  `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                  } h-11 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-white/18 text-white font-semibold' : 'text-white/85 hover:bg-white/10'
                  }`
                }
              >
                <Icon size={19} className="shrink-0" />
                {!collapsed && <span className="truncate">{link.label}</span>}
              </NavLink>
            );
          })}
        </div>

        {/* User Profile Info (Full Name & Email ID) */}
        <div className="px-3.5 py-3 border-t border-white/12 shrink-0">
          {!collapsed ? (
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate leading-tight">
                {user?.fullName || user?.name || 'Coordinator'}
              </div>
              <div className="text-[11px] text-white/70 truncate mt-1 font-normal select-all" title={user?.email}>
                {user?.email}
              </div>
            </div>
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-white/15 text-white font-bold text-xs flex items-center justify-center mx-auto"
              title={`${user?.fullName || 'User'} (${user?.email})`}
            >
              {(user?.fullName || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Bottom Actions: Settings & Sign out */}
        <div className="px-3 pb-3 space-y-1 shrink-0">
          <NavLink
            to="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'
              } h-11 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-white/18 text-white font-semibold' : 'text-white/85 hover:bg-white/10'
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
            className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'
              } h-11 rounded-lg text-sm font-medium text-white/85 hover:bg-white/10 transition-colors cursor-pointer`}
          >
            <LogOut size={19} className="shrink-0" />
            {!collapsed && <span className="truncate">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area (scrolls independently on desktop) */}
      <main className="flex-1 min-w-0 md:h-screen md:overflow-y-auto bg-page-bg">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
