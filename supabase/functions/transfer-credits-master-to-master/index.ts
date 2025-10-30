import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const { data: { user: requestingUser } } = await supabaseClient.auth.getUser(token);
    
    if (!requestingUser) {
      throw new Error('Unauthorized');
    }

    const { data: requestingRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    if (requestingRoleData?.role !== 'master') {
      throw new Error('Only master users can transfer credits');
    }

    const { targetUserId, amount } = await req.json();

    if (!targetUserId || !amount || amount <= 0) {
      throw new Error('Missing or invalid required fields: targetUserId and a positive amount are required.');
    }

    // 1. Check if requesting master has enough credits
    const { data: initiatorCredits, error: initiatorCreditsError } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    if (initiatorCreditsError) throw initiatorCreditsError;

    const currentInitiatorBalance = initiatorCredits?.balance || 0;
    if (currentInitiatorBalance < amount) {
      throw new Error(`Créditos insuficientes. Saldo atual: ${currentInitiatorBalance}`);
    }

    // 2. Verify target user is a master created by the requesting master
    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, created_by')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetProfileError) throw targetProfileError;
    if (!targetProfile) {
      throw new Error('Target user not found.');
    }
    if (targetProfile.created_by !== requestingUser.id) {
      throw new Error('You can only transfer credits to masters you created.');
    }

    const { data: targetRoleData, error: targetRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetRoleError) throw targetRoleError;
    if (targetRoleData?.role !== 'master') {
      throw new Error('You can only transfer credits to other master users.');
    }

    // 3. Deduct from initiator's balance
    const newInitiatorBalance = currentInitiatorBalance - amount;
    const { error: updateInitiatorError } = await supabaseAdmin
      .from('user_credits')
      .upsert({
        user_id: requestingUser.id,
        balance: newInitiatorBalance,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (updateInitiatorError) throw updateInitiatorError;

    // 4. Add to target's balance
    const { data: targetCredits, error: targetCreditsError } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetCreditsError && targetCreditsError.code !== 'PGRST116') throw targetCreditsError;

    const currentTargetBalance = targetCredits?.balance || 0;
    const newTargetBalance = currentTargetBalance + amount;

    const { error: updateTargetError } = await supabaseAdmin
      .from('user_credits')
      .upsert({
        user_id: targetUserId,
        balance: newTargetBalance,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (updateTargetError) throw updateTargetError;

    // 5. Record two transactions
    const transactionsToInsert = [
      {
        user_id: requestingUser.id,
        transaction_type: 'credit_spent',
        amount: -amount,
        balance_after: newInitiatorBalance,
        description: `Transferência para Master ${targetProfile.full_name || targetUserId}`,
        related_user_id: targetUserId,
        performed_by: requestingUser.id
      },
      {
        user_id: targetUserId,
        transaction_type: 'credit_added',
        amount: amount,
        balance_after: newTargetBalance,
        description: `Recebido de Master ${requestingUser.id}`, // Can't get requesting user's full_name easily here without another query
        related_user_id: requestingUser.id,
        performed_by: requestingUser.id
      }
    ];

    const { error: transactionError } = await supabaseAdmin
      .from('credit_transactions')
      .insert(transactionsToInsert);

    if (transactionError) throw transactionError;

    console.log(`Credits transferred successfully from ${requestingUser.id} to ${targetUserId}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Transferência de ${amount} créditos para ${targetProfile.full_name || targetUserId} realizada com sucesso.`,
        newInitiatorBalance,
        newTargetBalance
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