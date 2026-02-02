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
    const { email, password, fullName, resellerRole, isTestReseller, creditExpiryDate } = await req.json();

    console.log('Creating reseller user:', { email, fullName, resellerRole, isTestReseller, creditExpiryDate });

    // Validate inputs
    if (!email || !password || !fullName || !resellerRole) {
      throw new Error('Missing required fields');
    }

    if (!['admin', 'master', 'reseller', 'cliente'].includes(resellerRole)) {
      throw new Error('Invalid role');
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
    // Admin can create any role
    // Master can create reseller or cliente
    // Reseller can only create cliente
    if (!requestingRole || !['admin', 'master', 'reseller'].includes(requestingRole)) {
      throw new Error('Only admin, master and reseller users can create accounts');
    }

    // Masters cannot create admins
    if (requestingRole === 'master' && resellerRole === 'admin') {
      throw new Error('Masters cannot create admin accounts');
    }

    // Masters can only create master, reseller, or cliente
    if (requestingRole === 'master' && !['master', 'reseller', 'cliente'].includes(resellerRole)) {
      throw new Error('Masters can only create master, reseller or cliente accounts');
    }

    // Resellers can only create cliente
    if (requestingRole === 'reseller' && resellerRole !== 'cliente') {
      throw new Error('Resellers can only create cliente accounts');
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

    // Set credit expiry date based on user type
    let finalCreditExpiryDate: Date;
    if (isTestReseller) {
      if (creditExpiryDate && typeof creditExpiryDate === 'string') {
        // Use provided YYYY-MM-DD and normalize to 12:00 UTC to avoid TZ shifts
        const normalized = new Date(`${creditExpiryDate}T12:00:00.000Z`);
        finalCreditExpiryDate = normalized;
        console.log('Test reseller - using provided creditExpiryDate:', normalized.toISOString());
      } else {
        // For test resellers without explicit date, set expiry to current date (normalized)
        const now = new Date();
        now.setUTCHours(12, 0, 0, 0);
        finalCreditExpiryDate = now;
        console.log('Test reseller - setting credit expiry to current date:', finalCreditExpiryDate.toISOString());
      }
    } else {
      // For normal resellers, set expiry to 30 days from now
      finalCreditExpiryDate = new Date();
      finalCreditExpiryDate.setDate(finalCreditExpiryDate.getDate() + 30);
      console.log('Normal reseller - setting credit expiry to 30 days from now:', finalCreditExpiryDate.toISOString());
    }

    // Create profile with created_by tracking and email
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({ 
        user_id: newUser.user!.id, 
        full_name: fullName,
        email: email,
        created_by: requestingUser.id,
        status: 'active',
        credit_expiry_date: finalCreditExpiryDate.toISOString()
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error('Error upserting profile:', profileError);
      throw profileError;
    }

    console.log('Profile created');

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

    // Check and deduct credit for master/reseller users (skip for test users and admins)
    if ((requestingRole === 'master' || requestingRole === 'reseller') && !isTestReseller) {
      const { data: creditData, error: creditError } = await supabaseAdmin
        .from('user_credits')
        .select('balance')
        .eq('user_id', requestingUser.id)
        .maybeSingle();

      if (creditError) {
        console.error('Error fetching credits:', creditError);
        throw new Error('Erro ao verificar créditos');
      }

      if (!creditData || creditData.balance < 1) {
        throw new Error('Créditos insuficientes para criar usuário');
      }

      // Deduct 1 credit
      const newBalance = creditData.balance - 1;
      const { error: updateError } = await supabaseAdmin
        .from('user_credits')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('user_id', requestingUser.id);

      if (updateError) {
        console.error('Error updating credits:', updateError);
        throw updateError;
      }

      // Record transaction
      await supabaseAdmin
        .from('credit_transactions')
        .insert({
          user_id: requestingUser.id,
          transaction_type: 'credit_spent',
          amount: -1,
          balance_after: newBalance,
          description: `Criação do usuário ${fullName}`,
          related_user_id: newUser.user!.id,
          performed_by: requestingUser.id
        });

      console.log('Credit deducted successfully');
    } else if (isTestReseller) {
      console.log('Test user creation - skipping credit deduction');
    }

      // Enviar webhook para Acerto Certo (não bloqueia a resposta de sucesso)
      (async () => {
        try {
          const acertoCertoApiKey = Deno.env.get('ACERTO_CERTO_API_KEY');
          
          console.log('🔑 ACERTO_CERTO_API_KEY presente?', !!acertoCertoApiKey);
          console.log('🔑 Primeiros 10 caracteres:', acertoCertoApiKey?.substring(0, 10));
          
          if (!acertoCertoApiKey) {
            console.error('❌ CRITICAL: ACERTO_CERTO_API_KEY não configurado! Pulando envio de webhook.');
            return;
          }

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

          // Format credit_expiry_date to YYYY-MM-DD for the webhook
          const formattedExpiryDate = profile?.credit_expiry_date 
            ? new Date(profile.credit_expiry_date).toISOString().split('T')[0]
            : null;

          console.log('Webhook payload with vencimento:', formattedExpiryDate);

          // ATENÇÃO: Enviar senha em texto plano é inseguro. Idealmente o sistema 
          // receptor deveria gerar senha temporária ou usar fluxo de redefinição.
          const payload = {
            eventType: 'create_user',
            userId: newUser.user!.id,
            email: email,
            password: password,
            fullName: fullName,
            vencimento: formattedExpiryDate,
            role: 'user',
            phone: profile?.phone || null,
            tax_id: profile?.cpf || null
          };

          const requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${acertoCertoApiKey}`,
            'apikey': acertoCertoApiKey
          };
          
          console.log('📤 Headers preparados:', JSON.stringify(requestHeaders, null, 2));

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

          const webhookResponse = await fetch(config.webhook_url, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const responseBody = await webhookResponse.text();
          const statusCode = webhookResponse.status;

          console.log('Webhook response:', { statusCode, responseBody });

          // Registrar histórico do webhook
          console.log('💾 Salvando no histórico...');
          const { data: insertedData, error: logError } = await supabaseAdmin
            .from('acerto_certo_webhook_history')
            .insert({
              event_type: 'create_user',
              target_url: config.webhook_url,
              payload: payload,
              request_headers: requestHeaders,
              response_status_code: statusCode,
              response_body: responseBody,
              revenda_user_id: newUser.user!.id
            })
            .select();
            
          if (logError) {
            console.error('❌ Erro ao salvar histórico:', logError);
          } else {
            console.log('✅ Histórico salvo com sucesso:', insertedData);
          }
        } else {
          console.log('No Acerto Certo webhook URL configured, skipping webhook');
        }
      } catch (webhookError) {
        console.error('Error sending webhook to Acerto Certo:', webhookError);
        
        const acertoCertoApiKey = Deno.env.get('ACERTO_CERTO_API_KEY');
        const fallbackHeaders = {
          'Content-Type': 'application/json',
          ...(acertoCertoApiKey && {
            'Authorization': `Bearer ${acertoCertoApiKey}`,
            'apikey': acertoCertoApiKey
          })
        };

        // Registrar falha no histórico
        try {
          await supabaseAdmin
            .from('acerto_certo_webhook_history')
            .insert({
              event_type: 'create_user',
              target_url: 'unknown',
              payload: { eventType: 'create_user', userId: newUser.user!.id },
              request_headers: fallbackHeaders,
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
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while creating the reseller user';
    console.error('Error in create-reseller-user function:', error);
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