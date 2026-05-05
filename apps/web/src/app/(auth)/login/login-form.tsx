'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { signInWithGoogle, signInWithMagicLink } from './actions';

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [isGooglePending, startGoogleTransition] = useTransition();
  const [isMagicPending, startMagicTransition] = useTransition();

  function handleGoogleSignIn() {
    startGoogleTransition(async () => {
      try {
        await signInWithGoogle();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Error al conectar con Google'
        );
      }
    });
  }

  function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startMagicTransition(async () => {
      const result = await signInWithMagicLink(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setMagicLinkSent(true);
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
        {/* Heading */}
        <div className="mb-8 text-center">
          <h1
            className="text-5xl font-bold text-white tracking-tight mb-2"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Virus
          </h1>
          <p className="text-sm text-white/50">Dev content, weaponized.</p>
        </div>

        {magicLinkSent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center py-6"
          >
            <div className="text-4xl mb-4">✉️</div>
            <h2 className="text-white font-semibold text-lg mb-2">
              Revisá tu email
            </h2>
            <p className="text-white/50 text-sm">
              Te enviamos un link a{' '}
              <span className="text-white/80 font-medium">{email}</span>.
              <br />
              Hacé click en el link para ingresar.
            </p>
            <button
              onClick={() => setMagicLinkSent(false)}
              className="mt-6 text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-4"
            >
              Usar otro email
            </button>
          </motion.div>
        ) : (
          <>
            {/* Google button */}
            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGooglePending || isMagicPending}
              className="w-full h-11 bg-white text-gray-900 hover:bg-gray-100 font-medium flex items-center justify-center gap-3 rounded-xl transition-all duration-200 disabled:opacity-60"
            >
              {isGooglePending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-gray-900" />
              ) : (
                <GoogleIcon />
              )}
              Continuar con Google
            </Button>

            {/* Separator */}
            <div className="my-6 flex items-center gap-3">
              <Separator className="flex-1 bg-white/10" />
              <span className="text-xs text-white/30 select-none">o</span>
              <Separator className="flex-1 bg-white/10" />
            </div>

            {/* Magic link form */}
            <form onSubmit={handleMagicLink} className="space-y-3">
              <Input
                type="email"
                name="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isMagicPending || isGooglePending}
                className="h-11 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-violet-500/40 focus-visible:border-violet-500/60 transition-colors"
              />
              <Button
                type="submit"
                disabled={isMagicPending || isGooglePending || !email.trim()}
                className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-all duration-200 disabled:opacity-50"
              >
                {isMagicPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Enviando...
                  </span>
                ) : (
                  'Enviar magic link'
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </motion.div>
  );
}
