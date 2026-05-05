'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

type TrendInfo = {
  direction: 'up' | 'down';
  pct: number;
} | null;

export interface KpiCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  trend: TrendInfo;
  index: number;
}

export function KpiCard({ label, value, icon, trend, index }: KpiCardProps) {
  return (
    <motion.div
      className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/50 text-sm font-medium">{label}</span>
        {icon}
      </div>

      <div className="text-3xl font-bold text-white tabular-nums">{value}</div>

      {trend && (
        <div
          className={`mt-2 text-sm ${
            trend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {trend.direction === 'up' ? '↑' : '↓'} {trend.pct}% vs semana ant.
        </div>
      )}
    </motion.div>
  );
}
