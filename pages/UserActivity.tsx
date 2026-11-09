
import React, { useState, useEffect } from 'react';
import { MonitorPlay, Clock, User, ShieldAlert, CheckCircle2, History } from 'lucide-react';
import { getAllUserActivity, UserActivity as UserActivityType } from '../utils/activityTracker';

const UserActivity = () => {
  const [activities, setActivities] = useState<UserActivityType[]>([]);

  useEffect(() => {
    const data = getAllUserActivity();
    setActivities(Object.values(data).sort((a, b) => b.lastActivityAt - a.lastActivityAt));
  }, []);

  const formatLastSeen = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <MonitorPlay className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white capitalize">User Activity Tracking</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">Monitor account status and inactivity periods</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Tracked</span>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white font-mono">{activities.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Users</span>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white font-mono">
            {activities.filter(a => a.status === 'active').length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Inactive (7+ Days)</span>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white font-mono">
            {activities.filter(a => a.status === 'inactive').length}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden text-[14px]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tight flex items-center">
            <History className="w-4 h-4 mr-2" /> Recent User Activity
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 capitalize font-bold">Email Address</th>
                <th className="px-6 py-4 capitalize font-bold">Last Activity At</th>
                <th className="px-6 py-4 capitalize font-bold">Status</th>
                <th className="px-6 py-4 capitalize font-bold">Raw Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No user activity recorded yet.</td>
                </tr>
              ) : (
                activities.map((item) => (
                  <tr key={item.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{item.email}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-2 opacity-50" />
                      {formatLastSeen(item.lastActivityAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        item.status === 'active' 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400 animate-pulse'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">{item.lastActivityAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-lg p-4 flex items-start space-x-3">
        <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p className="font-bold mb-1">System Logic Note:</p>
          <ul className="list-disc list-inside space-y-1 opacity-90">
            <li>Users are marked as <strong>Inactive</strong> after 7 days of no system interaction.</li>
            <li>Any significant action (Login, Bill Creation, Record Update) automatically restores <strong>Active</strong> status.</li>
            <li>Inactivity check runs every 60 seconds and on application startup.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UserActivity;
