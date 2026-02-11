-- Allow resellers to see their own credits
CREATE POLICY "Resellers podem ver seus próprios créditos"
ON public.user_credits
FOR SELECT
USING (has_role(auth.uid(), 'reseller'::app_role) AND (user_id = auth.uid()));

-- Allow resellers to see their own transaction history
CREATE POLICY "Resellers podem ver seu próprio histórico"
ON public.credit_transactions
FOR SELECT
USING (has_role(auth.uid(), 'reseller'::app_role) AND (user_id = auth.uid()));