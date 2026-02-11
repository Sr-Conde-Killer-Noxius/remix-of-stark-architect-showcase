import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

    if (!supabaseAnonKey) {
      throw new Error('Missing SUPABASE_ANON_KEY');
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestingUserId = claimsData.claims.sub;

    const { data: requestingRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUserId)
      .maybeSingle();

    const requestingRole = requestingRoleData?.role;
    if (requestingRole !== 'master' && requestingRole !== 'reseller') {
      throw new Error('Only master or reseller users can transfer credits');
    }

    const { targetUserId, amount } = await req.json();

    if (!targetUserId || !amount || amount === 0) {
      throw new Error('Missing or invalid required fields: targetUserId and a non-zero amount are required.');
    }

    const isRemoval = amount < 0;
    const absAmount = Math.abs(amount);

    // 1. Check credits
    const { data: initiatorCredits, error: initiatorCreditsError } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', requestingUserId)
      .maybeSingle();

    if (initiatorCreditsError) throw initiatorCreditsError;
    const currentInitiatorBalance = initiatorCredits?.balance || 0;

    const { data: targetCredits, error: targetCreditsError } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetCreditsError && targetCreditsError.code !== 'PGRST116') throw targetCreditsError;
    const currentTargetBalance = targetCredits?.balance || 0;

    if (isRemoval) {
      if (currentTargetBalance < absAmount) {
        throw new Error(`O usuário alvo tem apenas ${currentTargetBalance} créditos. Não é possível remover ${absAmount}.`);
      }
    } else {
      if (currentInitiatorBalance < absAmount) {
        throw new Error(`Créditos insuficientes. Saldo atual: ${currentInitiatorBalance}`);
      }
    }

    // 2. Calculate new balances
    let newInitiatorBalance: number;
    let newTargetBalance: number;

    if (isRemoval) {
      newTargetBalance = currentTargetBalance - absAmount;
      newInitiatorBalance = currentInitiatorBalance + absAmount;
    } else {
      newInitiatorBalance = currentInitiatorBalance - absAmount;
      newTargetBalance = currentTargetBalance + absAmount;
    }

    // 3. Update balances
    const { error: updateInitiatorError } = await supabaseAdmin
      .from('user_credits')
      .upsert({
        user_id: requestingUserId,
        balance: newInitiatorBalance,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (updateInitiatorError) throw updateInitiatorError;

    const { error: updateTargetError } = await supabaseAdmin
      .from('user_credits')
      .upsert({
        user_id: targetUserId,
        balance: newTargetBalance,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (updateTargetError) throw updateTargetError;

    // Get profiles for descriptions
    const { data: requestingProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', requestingUserId)
      .maybeSingle();

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const { data: targetRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const requestingUserName = requestingProfile?.full_name || requestingUserId;
    const targetUserName = targetProfile?.full_name || targetUserId;
    const targetRole = targetRoleData?.role;
    const targetRoleLabel = targetRole === 'master' ? 'Master' : 'Revenda';
    const requestingRoleLabel = requestingRole === 'master' ? 'Master' : 'Revenda';

    // 4. Record transactions
    let transactionsToInsert;

    if (isRemoval) {
      transactionsToInsert = [
        {
          user_id: targetUserId,
          transaction_type: 'credit_spent',
          amount: -absAmount,
          balance_after: newTargetBalance,
          description: `Créditos removidos por ${requestingRoleLabel} ${requestingUserName}`,
          related_user_id: requestingUserId,
          performed_by: requestingUserId
        },
        {
          user_id: requestingUserId,
          transaction_type: 'credit_added',
          amount: absAmount,
          balance_after: newInitiatorBalance,
          description: `Créditos devolvidos de ${targetRoleLabel} ${targetUserName}`,
          related_user_id: targetUserId,
          performed_by: requestingUserId
        }
      ];
    } else {
      transactionsToInsert = [
        {
          user_id: requestingUserId,
          transaction_type: 'credit_spent',
          amount: -absAmount,
          balance_after: newInitiatorBalance,
          description: `Transferência para ${targetRoleLabel} ${targetUserName}`,
          related_user_id: targetUserId,
          performed_by: requestingUserId
        },
        {
          user_id: targetUserId,
          transaction_type: 'credit_added',
          amount: absAmount,
          balance_after: newTargetBalance,
          description: `Recebido de ${requestingRoleLabel} ${requestingUserName}`,
          related_user_id: requestingUserId,
          performed_by: requestingUserId
        }
      ];
    }

    const { error: transactionError } = await supabaseAdmin
      .from('credit_transactions')
      .insert(transactionsToInsert);

    if (transactionError) throw transactionError;

    const action = isRemoval ? 'removidos de' : 'transferidos para';
    console.log(`Credits ${action} ${targetUserId} by ${requestingUserId}. Amount: ${absAmount}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${absAmount} crédito(s) ${action} ${targetUserName} com sucesso.`,
        newInitiatorBalance,
        newTargetBalance,
        targetUser: targetUserName
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Error in transfer-credits-master-to-master function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
