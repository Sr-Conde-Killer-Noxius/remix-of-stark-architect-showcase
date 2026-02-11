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

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !requestingUser) {
      console.error('Auth error:', userError?.message || 'No user');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check requesting user's role
    const { data: requestingRoleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    if (roleError) {
      console.error('Error fetching role:', roleError);
      return new Response(JSON.stringify({ error: 'Could not verify user role' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestingRole = requestingRoleData?.role;
    if (requestingRole !== 'admin' && requestingRole !== 'master' && requestingRole !== 'reseller') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch profiles based on role
    let profilesQuery = supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, created_at');

    if (requestingRole !== 'admin') {
      // Master/Reseller: only see users they created
      profilesQuery = profilesQuery.eq('created_by', requestingUser.id);
    }

    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError) throw profilesError;

    // Fetch all user roles
    const profileUserIds = (profiles || []).map(p => p.user_id);
    if (profileUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, masters: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const { data: userRoles, error: userRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', profileUserIds);
    if (userRolesError) throw userRolesError;
    const roleMap = new Map(userRoles?.map(ur => [ur.user_id, ur.role]));

    // Filter for master AND reseller users
    const masterResellerUserIds = profileUserIds
      .filter(uid => roleMap.get(uid) === 'master' || roleMap.get(uid) === 'reseller');

    if (masterResellerUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, masters: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Fetch credits
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

    const userDetails = (profiles || [])
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in get-master-user-details function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
