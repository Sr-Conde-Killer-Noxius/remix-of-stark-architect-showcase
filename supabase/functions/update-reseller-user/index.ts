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

    const { userId, email, fullName, phone, password, planId, expiryDate, status, role, creditExpiryDate } = await req.json();

    console.log('Updating reseller user:', { userId, email, fullName, phone, role, creditExpiryDate });

    if (!userId) {
      throw new Error('User ID is required');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    let isServiceRoleCall = false;
    let requestingUser: { id: string } | null = null;
    let requestingRole: 'admin' | 'master' | 'reseller' | null = null;

    // Check if the request is from an internal service using the service role key
    if (token === supabaseServiceKey) {
      isServiceRoleCall = true;
      requestingUser = { id: 'supabase_service_role_internal_user' }; // A dummy ID for internal calls
      requestingRole = 'admin'; // Service role has admin privileges
      console.log('Request authorized as internal service role.');
    } else {
      // Original logic for user-based authentication
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

      const { data: { user: authenticatedUser } } = await supabaseClient.auth.getUser(token);
      requestingUser = authenticatedUser;

      if (!requestingUser) {
        throw new Error('Unauthorized');
      }

      const { data: requestingRoleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', requestingUser.id)
        .maybeSingle();

      requestingRole = requestingRoleData?.role;
    }

    // Now, use requestingUser and requestingRole for permission checks
    if (!requestingRole || !['admin', 'master'].includes(requestingRole)) {
      throw new Error('Only admin and master users can update accounts');
    }

    // For masters, verify they created this user. Skip this check if it's a service role call.
    if (requestingRole === 'master' && !isServiceRoleCall) {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('created_by')
        .eq('user_id', userId)
        .maybeSingle();

      if (!targetProfile || targetProfile.created_by !== requestingUser.id) {
        throw new Error('You can only update users you created');
      }
    }

    // Masters cannot change role to admin
    if (requestingRole === 'master' && role === 'admin') {
      throw new Error('Masters cannot assign admin role');
    }

    // Update auth user if email or password changed
    const updateData: any = {};
    if (email) updateData.email = email;
    if (password) updateData.password = password;

    if (Object.keys(updateData).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        updateData
      );

      if (authError) {
        console.error('Error updating auth user:', authError);
        throw authError;
      }
    }

    // Fetch current status if status update is requested
    let currentStatus: string | null = null;
    if (status !== undefined) {
      const { data: currentProfile, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (fetchError) {
        console.warn(`Failed to fetch current status for user ${userId}:`, fetchError.message);
      } else {
        currentStatus = currentProfile?.status;
      }
    }

    // Update role if provided
    if (role !== undefined) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId);

      if (roleError) {
        console.error('Error updating role:', roleError);
        throw roleError;
      }
    }

    // Update profile
    const profileUpdate: any = {};
    if (fullName) profileUpdate.full_name = fullName;
    if (email) profileUpdate.email = email;
    if (phone) profileUpdate.phone = phone;
    if (planId !== undefined) profileUpdate.plan_id = planId;
    if (expiryDate !== undefined) profileUpdate.expiry_date = expiryDate;
    if (status !== undefined) profileUpdate.status = status;
    if (creditExpiryDate !== undefined) profileUpdate.credit_expiry_date = creditExpiryDate; // Adicionado para atualizar o vencimento do crédito

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', userId);

      if (profileError) {
        console.error('Error updating profile:', profileError);
        throw profileError;
      }

      // Send webhook if status changed to inactive, suspended or active
      if (status !== undefined && currentStatus !== status && (status === 'inactive' || status === 'suspended' || status === 'active')) {
        console.log(`Status changed for user ${userId} from ${currentStatus} to ${status}. Sending webhook...`);
        
        let targetWebhookUrl = 'not_configured'; // Default value
        const webhookPayload = {
          eventType: 'update_user_status',
          userId: userId,
          newStatus: status
        };

        try {
          const { data: config } = await supabaseAdmin
            .from('webhook_configs')
            .select('webhook_url')
            .eq('config_key', 'acerto_certo_webhook_url')
            .maybeSingle();

          if (config?.webhook_url) {
            targetWebhookUrl = config.webhook_url;
            fetch(targetWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
              signal: AbortSignal.timeout(10000)
            }).then(async response => {
              const body = await response.text();
              const { error: historyError } = await supabaseAdmin.from('acerto_certo_webhook_history').insert({
                event_type: 'update_user_status',
                target_url: targetWebhookUrl, // Use the determined targetWebhookUrl
                payload: webhookPayload,
                response_status_code: response.status,
                response_body: body,
                revenda_user_id: userId
              });
              
              if (historyError) {
                console.error(`Failed to insert webhook history for update_user_status:`, historyError);
              } else {
                console.log(`Webhook sent: Status ${response.status} for update_user_status, user ${userId}`);
              }
            }).catch(async (fetchError) => {
              console.error(`Failed to send update_user_status webhook for user ${userId}:`, fetchError.message);
              const { error: historyError } = await supabaseAdmin.from('acerto_certo_webhook_history').insert({
                event_type: 'update_user_status',
                target_url: targetWebhookUrl, // Use the determined targetWebhookUrl
                payload: webhookPayload,
                response_status_code: 500,
                response_body: fetchError.message,
                revenda_user_id: userId
              });
              
              if (historyError) {
                console.error(`Failed to insert webhook history for update_user_status (error case):`, historyError);
              }
            });
          } else {
            console.warn(`Acerto Certo webhook URL not configured. Skipping webhook for user ${userId}. Logging to history anyway.`);
            // Log to history even if webhook URL is not configured
            await supabaseAdmin.from('acerto_certo_webhook_history').insert({
              event_type: 'update_user_status',
              target_url: targetWebhookUrl, // Will be 'not_configured'
              payload: webhookPayload,
              response_status_code: 200, // Assume success for logging purposes if no webhook was sent
              response_body: 'Webhook URL not configured, no external call made.',
              revenda_user_id: userId
            });
          }
        } catch (webhookError: any) {
          console.error(`Error during webhook preparation for user ${userId}:`, webhookError.message);
          // Ensure logging even if initial config fetch fails
          try {
            await supabaseAdmin.from('acerto_certo_webhook_history').insert({
              event_type: 'update_user_status',
              target_url: targetWebhookUrl, // Will be 'not_configured' or the fetched URL if it failed later
              payload: webhookPayload,
              response_status_code: 500,
              response_body: webhookError instanceof Error ? webhookError.message : 'Unknown error during webhook processing.',
              revenda_user_id: userId
            });
          } catch (logError) {
            console.error('Failed to log webhook error during initial webhook processing error:', logError);
          }
        }
      }

      // If creditExpiryDate was updated, trigger check-expired-credits function
      if (creditExpiryDate !== undefined) {
        console.log(`creditExpiryDate updated for user ${userId}. Invoking check-expired-credits...`);
        // Invoke check-expired-credits asynchronously
        (async () => {
          try {
            const { data: checkResult, error: checkError } = await supabaseAdmin.functions.invoke(
              "check-expired-credits",
              {
                // No specific body needed, as it scans all profiles
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}` // Use service key for internal function call
                }
              }
            );
            if (checkError) {
              console.error('Error invoking check-expired-credits:', checkError);
            } else {
              console.log('check-expired-credits invoked successfully:', checkResult);
            }
          } catch (invokeError) {
            console.error('Unexpected error during check-expired-credits invocation:', invokeError);
          }
        })();
      }
    }

    console.log('User updated successfully');

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
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while updating the reseller user';
    console.error('Error in update-reseller-user function:', error);
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