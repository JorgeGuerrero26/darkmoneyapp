-- app_error_logs: red de seguridad para errores y eventos sospechosos en el cliente.
-- Permite confirmar regresiones (p. ej. signouts silenciosos, queries reventadas,
-- crashes de React) sin necesidad de reproducir el bug localmente.
--
-- Inserts permitidos a anon/authenticated porque la app necesita poder loggear
-- incluso si la sesión expiró. user_id queda null en ese caso.
-- Reads restringidos al dueño (debug self-service).

CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  level text NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  source text NOT NULL,
  message text NOT NULL,
  context jsonb,
  app_version text,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at
  ON public.app_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_user_created
  ON public.app_error_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_source_level
  ON public.app_error_logs (source, level);

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

-- Insert: cualquiera (anon o authenticated). Si user_id viene seteado, debe
-- coincidir con auth.uid() para evitar spoofing. user_id null se acepta para
-- errores pre-login o post-signout.
DROP POLICY IF EXISTS "app_error_logs_insert_any" ON public.app_error_logs;
CREATE POLICY "app_error_logs_insert_any"
  ON public.app_error_logs
  FOR INSERT
  TO public
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Select: solo el dueño puede leer sus propios logs.
DROP POLICY IF EXISTS "app_error_logs_select_own" ON public.app_error_logs;
CREATE POLICY "app_error_logs_select_own"
  ON public.app_error_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
