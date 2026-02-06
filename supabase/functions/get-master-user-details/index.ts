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
      return new Response('Unauthorized: No Authorization header', { status: 401, headers: corsHeaders });
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
      return new Response('Unauthorized: Invalid token', { status: 401, headers: corsHeaders });
    }

    // Check if requesting user is admin
    const { data: requestingRoleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    if (roleError) {
      console.error('Error fetching requesting user role:', roleError);
      return new Response('Internal Server Error: Could not verify user role', { status: 500, headers: corsHeaders });
    }

    if (requestingRoleData?.role !== 'admin') {
      return new Response('Forbidden: Only admin users can access this resource', { status: 403, headers: corsHeaders });
    }

    // Fetch all profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, created_at');
    if (profilesError) throw profilesError;

    // Fetch all user roles
    const { data: userRoles, error: userRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role');
    if (userRolesError) throw userRolesError;
    const roleMap = new Map(userRoles?.map(ur => [ur.user_id, ur.role]));

    // Filter for master AND reseller users
    const masterResellerUserIds = profiles
      .filter(p => roleMap.get(p.user_id) === 'master' || roleMap.get(p.user_id) === 'reseller')
      .map(p => p.user_id);

    // Fetch all user credits for master/reseller users
    const { data: userCredits, error: userCreditsError } = await supabaseAdmin
      .from('user_credits')
      .select('user_id, balance')
      .in('user_id', masterResellerUserIds);
    if (userCreditsError) throw userCreditsError;
    const creditMap = new Map(userCredits?.map(uc => [uc.user_id, uc.balance]));

    // Fetch auth.users data for last_sign_in_at
    const { data: authUsersData, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers();
    if (authUsersError) throw authUsersError;
    const authUserMap = new Map(authUsersData.users.map(u => [u.id, u.last_sign_in_at]));

    const userDetails = profiles
      .filter(p => masterResellerUserIds.includes(p.user_id))
      .map(p => ({
        user_id: p.user_id,
        full_name: p.full_name || 'N/A',
        credit_balance: creditMap.get(p.user_id) || 0,
        last_login_at: authUserMap.get(p.user_id) || null,
        role: roleMap.get(p.user_id) || 'unknown',
        created_at: p.created_at || null,
      }));

    return new Response(
      JSON.stringify({ success: true, masters: userDetails }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in get-master-user-details function:', error);
    const errorMessage = error instanceof Response ? await error.text() : (error instanceof Error ? error.message : 'An unknown error occurred');
    const status = error instanceof Response ? error.status : 500;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: status,
      }
    );
  }
});