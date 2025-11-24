-- Adicionar coluna request_headers na tabela acerto_certo_webhook_history
ALTER TABLE public.acerto_certo_webhook_history 
ADD COLUMN IF NOT EXISTS request_headers jsonb;