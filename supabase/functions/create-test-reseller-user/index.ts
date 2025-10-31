import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get the request body
    const { email, password, fullName, resellerRole } = await req.json();

    console.log('Creating TEST reseller user:', { email, fullName, resellerRole });

    // Validate inputs
    if (!email || !password || !fullName || !resellerRole) {
      throw new Error('Missing required fields');
    }

    if (!['admin', 'master', 'reseller'].includes(resellerRole)) {
      throw new Error('Invalid reseller role');
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

    // Validate permissions based on role hierarchy
    if (!requestingRole || !['admin', 'master'].includes(requestingRole)) {
      throw new Error('Only admin and master users can create accounts');
    }

    // Masters cannot create admins
    if (requestingRole === 'master' && resellerRole === 'admin') {
      throw new Error('Masters cannot create admin accounts');
    }

    // Create the user using admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName
      }
    });

    if (createError) {
      console.error('Error creating user:', createError);
      
      // Check if error is due to duplicate email
      if (createError.message?.includes('already been registered') || createError.code === 'email_exists') {
        return new Response(
          JSON.stringify({ 
            error: 'Este email já está cadastrado no sistema. Por favor, use outro email.'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }
      
      throw createError;
    }

    console.log('User created successfully:', newUser.user?.id);

    // CRITICAL: Set credit expiry date to TODAY (current date) for test resellers
    const currentDate = new Date();
    currentDate.setUTCHours(12, 0, 0, 0); // Normalize to 12:00 UTC
    const creditExpiryDate = currentDate.toISOString();
    
    console.log('Test reseller - setting credit expiry to TODAY:', creditExpiryDate);

    // Create profile with created_by tracking and email
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({ 
        user_id: newUser.user!.id, 
        full_name: fullName,
        email: email,
        created_by: requestingUser.id,
        status: 'active',
        credit_expiry_date: creditExpiryDate
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error('Error upserting profile:', profileError);
      throw profileError;
    }

    console.log('Profile created with credit expiry date:', creditExpiryDate);

    // Insert role in user_roles table
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ 
        user_id: newUser.user!.id, 
        role: resellerRole 
      });

    if (roleError) {
      console.error('Error inserting role:', roleError);
      throw roleError;
    }

    console.log('Role assigned successfully');

    // Test resellers do NOT consume credits
    console.log('Test reseller creation - skipping credit deduction');

    // Enviar webhook para Acerto Certo (não bloqueia a resposta de sucesso)
    (async () => {
      try {
        const { data: config } = await supabaseAdmin
          .from('webhook_configs')
          .select('webhook_url')
          .eq('config_key', 'acerto_certo_webhook_url')
          .maybeSingle();

        if (config?.webhook_url) {
          console.log('Sending create_user webhook to Acerto Certo:', config.webhook_url);
          
          // Buscar dados adicionais do perfil criado
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('phone, cpf, credit_expiry_date')
            .eq('user_id', newUser.user!.id)
            .single();

          // Format credit_expiry_date to YYYY-MM-DD for the webhook (CURRENT DATE)
          const todayFormatted = new Date().toISOString().split('T')[0];

          // Payload para o Acerto Certo
          const payload = {
            eventType: 'create_user',
            userId: newUser.user!.id,
            email: email,
            password: password,
            fullName: fullName,
            vencimento: todayFormatted, // ALWAYS TODAY for test resellers
            role: 'user',
            phone: profile?.phone || null,
            tax_id: profile?.cpf || null
          };

          console.log('Webhook payload with vencimento (TODAY):', todayFormatted);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

          const webhookResponse = await fetch(config.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const responseBody = await webhookResponse.text();
          const statusCode = webhookResponse.status;

          console.log('Webhook response:', { statusCode, responseBody });

          // Registrar histórico do webhook
          await supabaseAdmin
            .from('acerto_certo_webhook_history')
            .insert({
              event_type: 'create_user',
              target_url: config.webhook_url,
              payload: payload,
              response_status_code: statusCode,
              response_body: responseBody,
              revenda_user_id: newUser.user!.id
            });

          console.log('Webhook history logged successfully');
        } else {
          console.log('No Acerto Certo webhook URL configured, skipping webhook');
        }
      } catch (webhookError) {
        console.error('Error sending webhook to Acerto Certo:', webhookError);
        
        // Registrar falha no histórico
        try {
          await supabaseAdmin
            .from('acerto_certo_webhook_history')
            .insert({
              event_type: 'create_user',
              target_url: 'unknown',
              payload: { eventType: 'create_user', userId: newUser.user!.id },
              response_status_code: 500,
              response_body: webhookError instanceof Error ? webhookError.message : 'Unknown error',
              revenda_user_id: newUser.user!.id
            });
        } catch (logError) {
          console.error('Failed to log webhook error:', logError);
        }
      }
    })();

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: newUser.user?.id,
          email: newUser.user?.email
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while creating the test reseller user';
    console.error('Error in create-test-reseller-user function:', error);
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
