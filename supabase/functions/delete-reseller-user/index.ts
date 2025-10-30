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

    const { userId } = await req.json();

    console.log('Deleting reseller user:', { userId });

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Check if the requesting user is a master
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if (!supabaseAnonKey) {
      throw new Error('Missing SUPABASE_ANON_KEY');
    }

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

    // Check requesting user's role
    const { data: requestingRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    const requestingRole = requestingRoleData?.role;

    if (!requestingRole || !['admin', 'master'].includes(requestingRole)) {
      throw new Error('Only admin and master users can delete accounts');
    }

    // For masters, verify they created this user
    if (requestingRole === 'master') {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('created_by')
        .eq('user_id', userId)
        .maybeSingle();

      if (!targetProfile || targetProfile.created_by !== requestingUser.id) {
        throw new Error('You can only delete users you created');
      }
    }

    // Delete the user using admin API first
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      throw deleteError;
    }

    console.log('User deleted successfully');

    // Enviar webhook para Acerto Certo e registrar histórico
    let targetWebhookUrl = 'not_configured';
    const payload = {
      eventType: 'delete_user',
      userId: userId
    };
    let statusCode = 200;
    let responseBody = 'Webhook URL not configured, no external call made.';

    try {
      const { data: config } = await supabaseAdmin
        .from('webhook_configs')
        .select('webhook_url')
        .eq('config_key', 'acerto_certo_webhook_url')
        .maybeSingle();

      if (config?.webhook_url) {
        targetWebhookUrl = config.webhook_url;
        console.log('Sending delete_user webhook to Acerto Certo:', targetWebhookUrl);
        
        const webhookResponse = await fetch(targetWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        responseBody = await webhookResponse.text();
        statusCode = webhookResponse.status;

        console.log('Webhook response:', { statusCode, responseBody });
      } else {
        console.log('No Acerto Certo webhook URL configured, skipping webhook.');
      }
    } catch (webhookError) {
      console.error('Error sending webhook to Acerto Certo:', webhookError);
      statusCode = 500;
      responseBody = webhookError instanceof Error ? webhookError.message : 'Unknown error during webhook processing.';
    } finally {
      // Sempre logar no histórico, independentemente do sucesso ou falha do fetch
      try {
        const { error: logInsertError } = await supabaseAdmin
          .from('acerto_certo_webhook_history')
          .insert({
            event_type: 'delete_user',
            target_url: targetWebhookUrl,
            payload: payload,
            response_status_code: statusCode,
            response_body: responseBody,
            revenda_user_id: userId
          });
        
        if (logInsertError) {
          console.error('Failed to log webhook history:', logInsertError);
          // Re-throw the error to ensure the main function's catch block is hit
          throw new Error(`Failed to log webhook history: ${logInsertError.message}`);
        }
        console.log('Webhook history logged successfully');
      } catch (logError) {
        console.error('Critical: Failed to log webhook history even after initial attempt:', logError);
        // Re-throw this critical error as well
        throw logError;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while deleting the reseller user';
    console.error('Error in delete-reseller-user function:', error);
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});