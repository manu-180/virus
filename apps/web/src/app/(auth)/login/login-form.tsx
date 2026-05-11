'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signInWithPassword } from './actions';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signInWithPassword(formData);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-[400px] px-4"
    >
      <div
        className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(124, 58, 237, 0.15) 0%, transparent 70%), rgba(255,255,255,0.04)',
        }}
      >
        <div className="mb-8 text-center">
          <h1
            className="text-5xl font-bold text-white tracking-tight mb-2"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Virus
          </h1>
          <p className="text-sm text-white/50">Dev content, weaponized.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            name="email"
            placeholder="tu@email.com"
            required
            disabled={isPending}
            className="h-11 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-violet-500/40 focus-visible:border-violet-500/60 transition-colors"
          />
          <Input
            type="password"
            name="password"
            placeholder="Contraseña"
            required
            disabled={isPending}
            className="h-11 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-violet-500/40 focus-visible:border-violet-500/60 transition-colors"
          />
          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-all duration-200 disabled:opacity-50"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Ingresando...
              </span>
            ) : (
              'Ingresar'
            )}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
