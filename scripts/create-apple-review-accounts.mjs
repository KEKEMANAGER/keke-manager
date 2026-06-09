/**
 * Creates Apple App Review demo company + driver (verified, with vehicle + sample tour booking).
 *
 * Usage (Supabase Dashboard → Settings → API → service_role key):
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   set EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
 *   node scripts/create-apple-review-accounts.mjs
 *
 * Re-run safe: updates existing users by email.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY and EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL).');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = process.env.APPLE_REVIEW_PASSWORD || 'KekeAppleReview2026!';

const COMPANY = {
  email: 'apple.review.company@kekemanager.app',
  fullName: 'Apple Review Company',
  role: 'company',
  companyName: 'Apple Review Tours',
};

const DRIVER = {
  email: 'apple.review.driver@kekemanager.app',
  fullName: 'Apple Review Driver',
  role: 'driver',
  phone: '+995555123456',
  plate: 'REV-001',
};

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function ensureAuthUser({ email, fullName, role, extraMeta = {} }) {
  let user = await findUserByEmail(email);
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, ...extraMeta },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Updated auth user: ${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, ...extraMeta },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created auth user: ${email}`);
  }
  return user;
}

async function upsertPublicUser(userId, patch) {
  const { error } = await admin.from('users').upsert({ id: userId, ...patch }, { onConflict: 'id' });
  if (error) {
    throw new Error(`users upsert: ${error.message} (${error.code}) ${error.details ?? ''}`);
  }
}

async function upsertProfile(userId, patch) {
  const { error } = await admin.from('profiles').upsert({ id: userId, ...patch }, { onConflict: 'id' });
  if (error) {
    throw new Error(`profiles upsert: ${error.message} (${error.code}) ${error.details ?? ''}`);
  }
}

async function ensureDriverVehicle(driverId) {
  const { data: existing } = await admin
    .from('vehicles')
    .select('id')
    .eq('driver_id', driverId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await admin
      .from('vehicles')
      .update({
        type: 'minivan',
        class: 'comfort',
        plate: DRIVER.plate,
        model: 'Demo Minivan',
        color: 'white',
        year: 2022,
        is_active: true,
        is_verified: true,
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data, error } = await admin
    .from('vehicles')
    .insert({
      driver_id: driverId,
      type: 'minivan',
      class: 'comfort',
      plate: DRIVER.plate,
      model: 'Demo Minivan',
      color: 'white',
      year: 2022,
      is_active: true,
      is_verified: true,
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(`vehicle insert: ${error.message} (${error.code}) ${error.details ?? ''}`);
  }
  const tag = 'APPLE-REVIEW-TOUR';
  const { data: existing } = await admin
    .from('bookings')
    .select('id, status')
    .eq('company_id', companyId)
    .ilike('comment', `%${tag}%`)
    .in('status', ['accepted', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    console.log(`Sample tour booking exists: ${existing.id} (${existing.status})`);
    return existing.id;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateDisplay = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`;

  const { data, error } = await admin
    .from('bookings')
    .insert({
      company_id: companyId,
      company_name: COMPANY.companyName,
      driver_id: driverId,
      vehicle_id: vehicleId,
      status: 'accepted',
      kind: 'tour',
      booking_type: 'day_tour',
      from_location: 'Tbilisi',
      from_location_type: null,
      to_location: 'Kazbegi',
      to_location_type: null,
      route: 'Tbilisi → Kazbegi (Apple Review demo)',
      date_display: dateDisplay,
      passengers: 4,
      vehicle_type: 'minivan',
      vehicle_class: 'comfort',
      price_gel: 350,
      client_price: 350,
      commission: 0,
      comment: `${tag} — App Store review sample day tour`,
      voucher_code: `KEKE-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      driver_display_name: DRIVER.fullName,
      driver_phone: DRIVER.phone,
      driver_plate: DRIVER.plate,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`booking insert: ${error.message} (${error.code}) ${error.details ?? ''}`);
  }
  console.log(`Created sample tour booking: ${data.id}`);
  return data.id;
}

async function main() {
  console.log('KEKE Apple Review demo setup\n');

  const companyUser = await ensureAuthUser({
    email: COMPANY.email,
    fullName: COMPANY.fullName,
    role: COMPANY.role,
    extraMeta: {
      company_email: COMPANY.email,
      company_phone: '+995555000001',
      company_id_code: '000000000',
      company_director: 'Apple Review',
    },
  });

  await upsertPublicUser(companyUser.id, {
    role: 'company',
    full_name: COMPANY.fullName,
    email: COMPANY.email,
    company_email: COMPANY.email,
    company_phone: '+995555000001',
    company_id_code: '000000000',
    company_director: 'Apple Review',
    is_verified: true,
    verification_status: 'approved',
    is_blocked: false,
  });

  const driverUser = await ensureAuthUser({
    email: DRIVER.email,
    fullName: DRIVER.fullName,
    role: DRIVER.role,
    extraMeta: { is_hired_driver: false, is_guide_driver: true },
  });

  await upsertPublicUser(driverUser.id, {
    role: 'driver',
    full_name: DRIVER.fullName,
    email: DRIVER.email,
    phone: DRIVER.phone,
    is_verified: true,
    verification_status: 'approved',
    is_guide_driver: true,
    is_hired_driver: false,
    is_blocked: false,
    languages: ['en', 'ka', 'ru'],
  });

  await upsertProfile(driverUser.id, { is_verified: true, vehicle_type: 'minivan', vehicle_class: 'comfort' });

  const vehicleId = await ensureDriverVehicle(driverUser.id);
  const bookingId = await ensureSampleTourBooking(companyUser.id, driverUser.id, vehicleId);

  console.log('\n--- App Store Review credentials ---');
  console.log(`Company: ${COMPANY.email}`);
  console.log(`Driver:  ${DRIVER.email}`);
  console.log(`Password (both): ${DEMO_PASSWORD}`);
  console.log(`Sample booking id: ${bookingId}`);
  console.log('\nPaste into App Store Connect → Review Notes.');
}

main().catch((err) => {
  const msg = err?.message ?? String(err);
  const details = err?.details ?? err?.hint ?? '';
  console.error('Setup failed:', msg, details ? `(${details})` : '');
  if (err?.code) console.error('Code:', err.code);
  process.exit(1);
});
