'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Camera } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

import { createClient } from '@/lib/supabase/client';
import { BUCKETS } from '@/lib/storage/buckets';
import { UpdateHandleSchema } from '@/lib/zod/profile-schemas';
import type { Profile } from '@/server/profile/types';
import {
  updateHandle,
  updateAvatar,
  deleteAccount,
} from '@/server/profile/actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HandleFormValues = {
  handle: string;
};

type Props = {
  profile: Profile;
  email: string | undefined;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(handle: string | null, email: string | undefined): string {
  if (handle) return handle.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AccountSettingsClient({ profile, email }: Props) {
  const router = useRouter();

  // ---- Avatar state --------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // ---- Handle form ---------------------------------------------------------
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting: isHandleSubmitting },
  } = useForm<HandleFormValues>({
    resolver: zodResolver(UpdateHandleSchema),
    defaultValues: { handle: profile.handle ?? '' },
  });

  // ---- Delete account dialog state ----------------------------------------
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, startDeleteTransition] = useTransition();

  // ---- Avatar upload -------------------------------------------------------
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no puede superar 2 MB.');
      // reset so same file can be re-selected after user fixes it
      e.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const supabase = createClient();

      // Get authenticated user to build the storage path
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('No estás autenticado.');
        return;
      }

      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKETS.avatars)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        toast.error(`Error al subir imagen: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKETS.avatars)
        .getPublicUrl(path);

      const publicUrl = publicUrlData.publicUrl;

      const result = await updateAvatar(publicUrl);

      if (!result.ok) {
        toast.error(`Error al guardar avatar: ${result.error.message}`);
        return;
      }

      setAvatarUrl(publicUrl);
      toast.success('Foto de perfil actualizada.');
      router.refresh();
    } catch (err) {
      toast.error('Ocurrió un error inesperado al subir la imagen.');
      console.error(err);
    } finally {
      setIsUploadingAvatar(false);
      // reset input so the same file can be picked again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ---- Handle submit -------------------------------------------------------
  async function onHandleSubmit(values: HandleFormValues) {
    const result = await updateHandle({ handle: values.handle });

    if (!result.ok) {
      if (result.error.code === 'HANDLE_TAKEN') {
        setError('handle', { message: 'Handle ya en uso' });
      } else {
        toast.error(result.error.message);
      }
      return;
    }

    toast.success('Handle actualizado correctamente.');
    router.refresh();
  }

  // ---- Delete account ------------------------------------------------------
  function openDeleteDialog() {
    setDeleteStep(1);
    setDeleteConfirmText('');
    setDeleteDialogOpen(true);
  }

  function handleDeleteStep1Confirm() {
    setDeleteStep(2);
  }

  function handleFinalDelete() {
    if (deleteConfirmText !== 'ELIMINAR') return;

    startDeleteTransition(async () => {
      const result = await deleteAccount();

      if (!result.ok) {
        toast.error(`Error al eliminar cuenta: ${result.error.message}`);
        return;
      }

      toast.success('Cuenta eliminada.');
      router.push('/login');
    });
  }

  // ---- Render --------------------------------------------------------------
  const initials = getInitials(profile.handle, email);

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------------------- */}
      {/* Section 1 – Avatar                                                  */}
      {/* ------------------------------------------------------------------- */}
      <section className="bg-bg-surface rounded-lg border border-border p-6">
        <h2 className="text-text-primary text-base font-semibold mb-4">
          Foto de perfil
        </h2>

        <div className="flex items-center gap-5">
          {/* Avatar — 48px */}
          <Avatar className="size-12 shrink-0">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt="Avatar" />
            ) : null}
            <AvatarFallback className="bg-bg-surface-high text-text-secondary text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Hidden real file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Seleccionar imagen de perfil"
          />

          <Button
            variant="outline"
            size="sm"
            disabled={isUploadingAvatar}
            onClick={() => fileInputRef.current?.click()}
            className="border-border text-text-secondary hover:text-text-primary"
          >
            {isUploadingAvatar ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
            {isUploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
          </Button>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Section 2 – Handle                                                  */}
      {/* ------------------------------------------------------------------- */}
      <section className="bg-bg-surface rounded-lg border border-border p-6">
        <h2 className="text-text-primary text-base font-semibold mb-4">
          Handle
        </h2>

        <form onSubmit={handleSubmit(onHandleSubmit)} noValidate>
          <div className="flex flex-col gap-2 max-w-sm">
            <Label htmlFor="handle" className="text-text-secondary">
              Handle
            </Label>

            {/* Input with @ prefix */}
            <div className="flex items-center rounded-lg border border-border bg-transparent focus-within:border-accent transition-colors overflow-hidden">
              <span className="px-2.5 py-1 text-text-tertiary text-sm select-none shrink-0">
                @
              </span>
              <input
                id="handle"
                type="text"
                autoComplete="username"
                className="h-8 flex-1 min-w-0 bg-transparent px-1 py-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-50"
                placeholder="tuhandle"
                aria-invalid={errors.handle ? 'true' : 'false'}
                {...register('handle')}
              />
            </div>

            {errors.handle ? (
              <p className="text-danger text-xs" role="alert">
                {errors.handle.message}
              </p>
            ) : (
              <p className="text-text-tertiary text-xs">
                Este es tu identificador público (@{profile.handle ?? 'tuhandle'})
              </p>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={isHandleSubmitting}
              className="self-start mt-1 bg-accent text-accent-fg hover:bg-accent-hover"
            >
              {isHandleSubmitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {isHandleSubmitting ? 'Guardando...' : 'Guardar handle'}
            </Button>
          </div>
        </form>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Section 3 – Email (read-only)                                       */}
      {/* ------------------------------------------------------------------- */}
      <section className="bg-bg-surface rounded-lg border border-border p-6">
        <h2 className="text-text-primary text-base font-semibold mb-4">
          Email
        </h2>

        <div className="flex flex-col gap-2 max-w-sm">
          <Label htmlFor="email" className="text-text-secondary">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email ?? ''}
            disabled
            readOnly
            className="border-border bg-bg-surface-high text-text-tertiary disabled:opacity-100"
          />
          <p className="text-text-tertiary text-xs">
            El email no se puede cambiar directamente. Contactá soporte.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Section 4 – Danger Zone                                             */}
      {/* ------------------------------------------------------------------- */}
      <section className="bg-bg-surface rounded-lg border border-border p-6">
        <div className="border-t border-border -mx-6 mb-6" />

        <h2 className="text-danger text-base font-semibold mb-1">
          Zona de peligro
        </h2>
        <p className="text-text-tertiary text-sm mb-4">
          Las acciones en esta sección son permanentes e irreversibles.
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={openDeleteDialog}
          className="border-danger text-danger hover:bg-danger/10 hover:text-danger"
        >
          Eliminar cuenta
        </Button>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Delete account dialog                                               */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent
          className="bg-bg-surface border border-border text-text-primary max-w-md"
          showCloseButton={!isDeleting}
        >
          <DialogHeader>
            <DialogTitle className="text-text-primary text-base font-semibold">
              {deleteStep === 1
                ? 'Eliminar cuenta'
                : 'Confirmacion final'}
            </DialogTitle>
          </DialogHeader>

          {deleteStep === 1 ? (
            <>
              <p className="text-text-secondary text-sm leading-relaxed">
                Esta accion eliminara todos tus datos permanentemente.
                No podras recuperar tu cuenta, videos, proyectos ni configuracion.
              </p>
              <DialogFooter className="bg-transparent border-none px-0 pb-0 -mx-0 -mb-0 mt-2">
                <DialogClose
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border text-text-secondary"
                    />
                  }
                >
                  Cancelar
                </DialogClose>
                <Button
                  size="sm"
                  onClick={handleDeleteStep1Confirm}
                  className="border-danger text-danger bg-transparent hover:bg-danger/10"
                  variant="outline"
                >
                  Si, continuar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-text-secondary text-sm leading-relaxed">
                Escribi{' '}
                <span className="text-danger font-semibold font-mono">
                  ELIMINAR
                </span>{' '}
                para confirmar que deseas eliminar tu cuenta de forma permanente.
              </p>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="delete-confirm"
                  className="text-text-secondary text-xs"
                >
                  Escribe ELIMINAR para confirmar
                </Label>
                <Input
                  id="delete-confirm"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="ELIMINAR"
                  disabled={isDeleting}
                  className="border-danger/50 focus-visible:border-danger bg-bg-surface-high text-text-primary"
                  autoComplete="off"
                />
              </div>

              <DialogFooter className="bg-transparent border-none px-0 pb-0 -mx-0 -mb-0 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDeleting}
                  onClick={() => setDeleteDialogOpen(false)}
                  className="border-border text-text-secondary"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deleteConfirmText !== 'ELIMINAR' || isDeleting}
                  onClick={handleFinalDelete}
                  className="border-danger text-danger bg-transparent hover:bg-danger/10 disabled:opacity-40"
                >
                  {isDeleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  {isDeleting ? 'Eliminando...' : 'Eliminar cuenta definitivamente'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
