'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { ProjectListItem } from '@/server/projects/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'justo ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: ProjectListItem;
  index: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectCard({ project, index }: ProjectCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
    >
      <Link
        href={`/projects/${project.slug}`}
        className="block bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 hover:bg-white/[0.07] hover:border-white/[0.14] transition-all duration-200 group"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-bold text-lg leading-tight truncate group-hover:text-white/90 transition-colors">
              {project.name}
            </h2>
            <p className="text-white/40 text-sm mt-0.5">@{project.slug}</p>
          </div>

        </div>

        {/* Color dot */}
        <div className="mb-4">
          <span
            className="inline-flex h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: project.themeColor }}
            aria-label="Color del proyecto"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.06] mb-3" />

        {/* Mini stats */}
        <p className="text-white/50 text-sm">
          <span className="text-white/70 font-medium">{project.inQueue}</span>
          {' '}en cola
          {project.lastPublished ? (
            <>
              {' · publicado '}
              <span className="text-white/70 font-medium">
                {formatRelativeTime(project.lastPublished)}
              </span>
            </>
          ) : (
            <span className="text-white/30"> · sin publicaciones</span>
          )}
        </p>

        {/* Theme color accent bar */}
        <div
          className="mt-4 h-0.5 w-8 rounded-full opacity-60 group-hover:w-12 group-hover:opacity-100 transition-all duration-300"
          style={{ backgroundColor: project.themeColor }}
        />
      </Link>
    </motion.div>
  );
}
