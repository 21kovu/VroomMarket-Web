import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function respond(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization?.startsWith('Bearer ')) {
    return respond(401, { error: 'Authentication or server configuration is missing.' });
  }

  const token = authorization.slice('Bearer '.length);
  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || authData.user?.app_metadata?.role !== 'admin') {
    return respond(403, { error: 'Administrator access is required.' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'create-dealer' || action === 'create-admin') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email.includes('@') || password.length < 8) return respond(400, { error: 'Enter a valid email and a password of at least 8 characters.' });
      if (action === 'create-dealer' && [body.name, body.phone, body.whatsapp, body.location].some(value => !String(value || '').trim())) {
        return respond(400, { error: 'Complete all dealer profile fields.' });
      }

      const role = action === 'create-admin' ? 'admin' : 'dealer';
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role }
      });
      if (error || !data.user) return respond(400, { error: error?.message || 'Could not create authentication account.' });

      if (role === 'dealer') {
        const { error: profileError } = await admin.from('dealers').insert({
          id: data.user.id,
          yard_name: String(body.name).trim(),
          email,
          phone: String(body.phone).trim(),
          whatsapp_number: String(body.whatsapp).trim(),
          location: String(body.location).trim()
        });
        if (profileError) {
          await admin.auth.admin.deleteUser(data.user.id);
          return respond(400, { error: `Dealer profile could not be saved: ${profileError.message}` });
        }
      }
      return respond(200, { id: data.user.id, email });
    }

    if (action === 'reset-password') {
      const userId = String(body.userId || '');
      const password = String(body.password || '');
      if (!userId || password.length < 8) return respond(400, { error: 'Choose a password of at least 8 characters.' });
      const { data: dealer, error: dealerError } = await admin.from('dealers').select('id').eq('id', userId).maybeSingle();
      if (dealerError || !dealer) return respond(404, { error: 'Dealer account was not found.' });
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return respond(400, { error: error.message });
      return respond(200, { success: true });
    }

    if (action === 'remove-dealer') {
      const userId = String(body.userId || '');
      if (!userId) return respond(400, { error: 'Dealer account was not specified.' });
      const { data: dealer, error: dealerError } = await admin.from('dealers').select('id').eq('id', userId).maybeSingle();
      if (dealerError || !dealer) return respond(404, { error: 'Dealer account was not found.' });

      const { data: photos, error: photosError } = await admin.from('car_photos')
        .select('storage_path, cars!inner(dealer_id)').eq('cars.dealer_id', userId);
      if (photosError) return respond(500, { error: `Could not list dealer photos: ${photosError.message}` });
      const storedPaths = (photos || []).map(photo => photo.storage_path);
      const { data: storedFiles, error: listError } = await admin.storage.from('car-images').list(userId, { limit: 1000 });
      if (listError) return respond(500, { error: `Could not list uploaded images: ${listError.message}` });
      const dealerPaths = (storedFiles || []).filter(file => file.id).map(file => `${userId}/${file.name}`);
      const allPaths = [...new Set([...storedPaths, ...dealerPaths])];
      if (allPaths.length) {
        const { error } = await admin.storage.from('car-images').remove(allPaths);
        if (error) return respond(500, { error: `Could not remove dealer photos: ${error.message}` });
      }

      const { error: appointmentsError } = await admin.from('appointments').delete().eq('dealer_id', userId);
      if (appointmentsError) return respond(500, { error: `Could not remove viewing requests: ${appointmentsError.message}` });
      const { error: salesError } = await admin.from('sales').delete().eq('dealer_id', userId);
      if (salesError) return respond(500, { error: `Could not remove sales: ${salesError.message}` });
      const { error: carsError } = await admin.from('cars').delete().eq('dealer_id', userId);
      if (carsError) return respond(500, { error: `Could not remove listings: ${carsError.message}` });
      const { error: profileError } = await admin.from('dealers').delete().eq('id', userId);
      if (profileError) return respond(500, { error: `Could not remove dealer profile: ${profileError.message}` });
      const { error: userError } = await admin.auth.admin.deleteUser(userId);
      if (userError) return respond(500, { error: `Dealer data was removed, but the login could not be deleted: ${userError.message}` });
      return respond(200, { success: true });
    }

    return respond(400, { error: 'Unsupported admin action.' });
  } catch (error) {
    return respond(400, { error: error instanceof Error ? error.message : 'Invalid request.' });
  }
});
