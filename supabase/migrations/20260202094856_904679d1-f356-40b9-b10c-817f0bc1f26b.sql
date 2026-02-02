-- Inserir entradas de controle de página para o role 'cliente'
-- Cliente só tem acesso ao perfil por padrão
INSERT INTO public.page_access_control (page_key, page_title, page_url, role, is_enabled)
VALUES 
  ('profile', 'Meu Perfil', '/profile', 'cliente', true),
  ('planos', 'Planos', '/planos', 'cliente', false),
  ('carteira', 'Carteira', '/carteira', 'cliente', false),
  ('templates', 'Templates', '/templates', 'cliente', false),
  ('whatsapp', 'WhatsApp', '/whatsapp', 'cliente', false),
  ('webhooks', 'Webhooks', '/webhooks', 'cliente', false),
  ('acerto_certo', 'Acerto Certo', '/settings/acerto-certo-integration', 'cliente', false),
  ('users', 'Clientes', '/users', 'cliente', false),
  ('revendas', 'Revendas', '/revendas', 'cliente', false)
ON CONFLICT DO NOTHING;

-- Adicionar entrada para a nova página de Revendas para master e reseller
INSERT INTO public.page_access_control (page_key, page_title, page_url, role, is_enabled)
VALUES 
  ('revendas', 'Revendas', '/revendas', 'master', true),
  ('revendas', 'Revendas', '/revendas', 'reseller', false)
ON CONFLICT DO NOTHING;