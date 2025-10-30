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
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get request body
    const { targetUserId, amount } = await req.json();

    console.log('Managing credits:', { targetUserId, amount });

    // Validate inputs
    if (!targetUserId || !amount) {
      throw new Error('Missing or invalid required fields');
    }

    // Allow negative amounts for removal
    if (amount === 0) {
      throw new Error('Amount cannot be zero');
    }

    // Check if requesting user is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey!, {
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

    // Check if requesting user is admin
    const { data: requestingRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    if (requestingRoleData?.role !== 'admin') {
      throw new Error('Only admins can manage credits');
    }

    // Get or create user_credits record
    const { data: existingCredits, error: fetchError } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows
      throw fetchError;
    }

    const currentBalance = existingCredits?.balance || 0;
    const newBalance = currentBalance + amount;

    // Prevent negative balance
    if (newBalance < 0) {
      throw new Error('Operação resultaria em saldo negativo. Saldo atual: ' + currentBalance);
    }

    // Upsert user_credits
    const { error: upsertError } = await supabaseAdmin
      .from('user_credits')
      .upsert({
        user_id: targetUserId,
        balance: newBalance,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (upsertError) {
      throw upsertError;
    }

    // Get target user name for description
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', targetUserId)
      .single();

    // Record transaction
    const { error: transactionError } = await supabaseAdmin
      .from('credit_transactions')
      .insert({
        user_id: targetUserId,
        transaction_type: 'credit_added',
        amount: amount,
        balance_after: newBalance,
        description: amount > 0 
          ? `Admin adicionou ${amount} crédito(s)`
          : `Admin removeu ${Math.abs(amount)} crédito(s)`,
        performed_by: requestingUser.id
      });

    if (transactionError) {
      throw transactionError;
    }

    console.log('Credits added successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        newBalance,
        targetUser: targetProfile?.full_name
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    console.error('Error in manage-credits function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
