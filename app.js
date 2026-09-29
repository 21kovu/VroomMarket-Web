const supabaseClient = window.supabaseClient;
const cars = [];
let dealerProfiles = [];
let dealerContacts = [];
let appointments = [];
let sales = [];
let loggedInDealer = null;
let activeCar = null;
let activePhotos = [];
let heroMake = '';
let heroMaxPrice = 0;

const fallbackMakes = ['Toyota', 'Honda', 'Nissan', 'Subaru', 'Mazda', 'Mercedes'];
const modelsByMake = {
  Toyota: ['Corolla Fielder', 'Corolla', 'Vitz', 'RAV4', 'Hilux'],
  Honda: ['Fit Hybrid', 'Civic', 'CR-V', 'Vezel'],
  Nissan: ['X-Trail', 'Note', 'Juke', 'Navara'],
  Subaru: ['Forester', 'Impreza', 'Outback'],
  Mazda: ['CX-5', 'Demio', 'Axela', 'CX-3'],
  Mercedes: ['C-Class', 'E-Class', 'GLC']
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function formatPrice(price) {
  return `KES ${Number(price || 0).toLocaleString('en-KE')}`;
}

function showSetupMessage() {
  const panel = document.querySelector('#view-login .panel');
  if (!supabaseClient && panel) {
    const message = document.createElement('p');
    message.className = 'setup-warning';
    message.textContent = 'Supabase is not configured. Set your project URL and publishable key in supabase.js, then reload.';
    panel.prepend(message);
  }
}

function showView(view) {
  ['home', 'buy', 'login', 'dealer', 'admin'].forEach(name => {
    document.getElementById(`view-${name}`).classList.toggle('hidden', name !== view);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'dealer') renderDealerDashboard();
  if (view === 'admin') renderAdminDashboard();
}

function getDealerContact(car) {
  const dealerName = String(car?.dealer || '').trim().toLowerCase();
  return dealerContacts.find(item => String(item.yard_name || '').trim().toLowerCase() === dealerName);
}

function mapDatabaseCar(row) {
  return {
    id: row.id,
    dealer_id: row.dealer_id,
    make: row.make,
    model: row.model,
    year: Number(row.year),
    price: Number(row.price),
    condition: row.condition,
    color: row.color || '',
    mileage: row.mileage || '',
    fuel: row.fuel || '',
    transmission: row.transmission || '',
    location: row.location || '',
    dealer: row.dealer_name || '',
    image: row.image_url || '',
    description: row.description || '',
    status: row.status || 'approved',
    photos: []
  };
}

function renderCars(targetId, listings) {
  const grid = document.getElementById(targetId);
  if (!grid) return;
  if (!listings.length) {
    grid.innerHTML = '<p class="empty-state">No car listings match your search.</p>';
    return;
  }
  grid.innerHTML = listings.map(car => {
    const location = getDealerContact(car)?.location || car.location;
    const image = car.photos?.[0]?.url || car.image;
    return `<article class="card" role="button" tabindex="0" onclick="openCar('${escapeHtml(car.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCar('${escapeHtml(car.id)}')}">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(`${car.year} ${car.make} ${car.model}`)}" loading="lazy">
      <div class="card-body"><h3>${escapeHtml(`${car.year} ${car.make} ${car.model}`)}</h3><div class="price">${formatPrice(car.price)}</div>
      <div class="meta">${escapeHtml(car.mileage)} · ${escapeHtml(location)}</div><span class="badge b-used">${escapeHtml(car.condition)}</span></div>
    </article>`;
  }).join('');
}

function searchFromHero() {
  const search = document.querySelector('.searchbar input').value.trim();
  const selects = document.querySelectorAll('.searchbar select');
  heroMake = selects[0].value === 'Any Make' ? '' : selects[0].value;
  const priceRanges = { 'Below 500K': 500000, '500K – 1M': 1000000, '1M – 2M': 2000000 };
  heroMaxPrice = priceRanges[selects[1].value] || 0;
  document.getElementById('filterModel').value = search;
  showView('buy');
  filterCars();
}

function filterCars() {
  const model = document.getElementById('filterModel').value.trim().toLowerCase();
  const year = document.getElementById('filterYear').value;
  const condition = document.getElementById('filterCondition').value;
  const color = document.getElementById('filterColor').value.trim().toLowerCase();
  const results = cars.filter(car => {
    const location = (getDealerContact(car)?.location || car.location || '').toLowerCase();
    return car.status === 'approved' && `${car.make} ${car.model}`.toLowerCase().includes(model)
      && (!year || String(car.year) === year)
      && (!condition || car.condition === condition)
      && (!color || String(car.color).toLowerCase().includes(color))
      && (!heroMake || car.make === heroMake)
      && (!heroMaxPrice || car.price <= heroMaxPrice)
      && (!document.getElementById('filterLocation') || document.getElementById('filterLocation').value.trim() === '' || location.includes(document.getElementById('filterLocation').value.trim().toLowerCase()));
  });
  document.getElementById('filterSummary').textContent = `${results.length} ${results.length === 1 ? 'car' : 'cars'} found`;
  renderCars('filteredCarGrid', results);
}

function clearCarFilters() {
  ['filterModel', 'filterYear', 'filterColor', 'filterLocation'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });
  document.getElementById('filterCondition').value = '';
  heroMake = '';
  heroMaxPrice = 0;
  filterCars();
}

function setMainPhoto(url) {
  const image = document.getElementById('mImg');
  image.src = url;
  image.alt = activeCar ? `${activeCar.year} ${activeCar.make} ${activeCar.model}` : 'Car photo';
}

function openCar(id) {
  activeCar = cars.find(car => String(car.id) === String(id));
  if (!activeCar) return;
  activePhotos = activeCar.photos?.length ? activeCar.photos : (activeCar.image ? [{ url: activeCar.image }] : []);
  setMainPhoto(activePhotos[0]?.url || '');
  document.getElementById('mPhotos').innerHTML = activePhotos.length > 1
    ? activePhotos.map((photo, index) => `<button type="button" class="photo-thumb" onclick="setMainPhoto('${escapeHtml(photo.url)}')" aria-label="View photo ${index + 1}"><img src="${escapeHtml(photo.url)}" alt=""></button>`).join('')
    : '';
  document.getElementById('mTitle').textContent = `${activeCar.year} ${activeCar.make} ${activeCar.model}`;
  document.getElementById('mPrice').textContent = formatPrice(activeCar.price);
  document.getElementById('mSpecs').innerHTML = [['Condition', activeCar.condition], ['Mileage', activeCar.mileage], ['Fuel', activeCar.fuel], ['Transmission', activeCar.transmission]]
    .map(([label, value]) => `<div><b>${escapeHtml(label)}</b>${escapeHtml(value)}</div>`).join('');
  document.getElementById('mDesc').textContent = activeCar.description;
  document.getElementById('mDealer').textContent = activeCar.dealer;
  document.getElementById('mLoc').textContent = getDealerContact(activeCar)?.location || activeCar.location;
  document.getElementById('bookBox').classList.add('hidden');
  document.getElementById('carModal').classList.add('show');
}

function closeModal() {
  document.getElementById('carModal').classList.remove('show');
}

function contactDealer(method) {
  if (!activeCar) return;
  const contact = getDealerContact(activeCar);
  const rawNumber = contact?.[method === 'whatsapp' ? 'whatsapp_number' : 'phone'] || '';
  const number = rawNumber.replace(/\D/g, '');
  if (!number) {
    alert(`No ${method === 'whatsapp' ? 'WhatsApp' : 'phone'} number is available for this dealer yet.`);
    return;
  }
  if (method === 'whatsapp') window.open(`https://wa.me/${number}?text=${encodeURIComponent(`Hi, I am interested in the ${activeCar.year} ${activeCar.make} ${activeCar.model}.`)}`, '_blank', 'noopener');
  else window.location.href = `tel:+${number}`;
}

async function submitBooking() {
  const name = document.getElementById('bName').value.trim();
  const phone = document.getElementById('bPhone').value.trim();
  const date = document.getElementById('bDate').value;
  const time = document.getElementById('bTime').value;
  const dealer = getDealerContact(activeCar);
  if (!activeCar || !name || !phone || !date || !time) return alert('Please enter your name, phone number, preferred date and time.');
  if (date < new Date().toISOString().slice(0, 10)) return alert('Choose today or a future date for the viewing.');
  if (!dealer?.id) return alert('This listing is not connected to a registered dealer profile yet.');
  const { error } = await supabaseClient.from('appointments').insert({
    dealer_id: dealer.id,
    car_id: activeCar.id,
    car_title: `${activeCar.year} ${activeCar.make} ${activeCar.model}`,
    buyer_name: name,
    buyer_phone: phone,
    viewing_date: date,
    viewing_time: time,
    message: document.getElementById('bMsg').value.trim()
  });
  if (error) return alert(`Could not save your viewing request: ${error.message}`);
  alert('Your viewing request has been sent to the dealer.');
  closeModal();
}

function loadModels() {
  const make = document.getElementById('cMake').value;
  const models = modelsByMake[make] || [];
  document.getElementById('cModel').innerHTML = '<option value="">Select Model...</option>' + models.map(model => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join('');
}

async function addCar() {
  const make = document.getElementById('cMake').value;
  const model = document.getElementById('cModel').value;
  const year = Number(document.getElementById('cYear').value);
  const price = Number(document.getElementById('cPrice').value);
  const photos = Array.from(document.getElementById('cPhotos').files || []);
  if (!make || !model || !year || !price || !photos.length) return alert('Choose a make, model, year, price and at least one photo.');
  if (!loggedInDealer?.id) return alert('Sign in with a registered dealer account before publishing a car.');
  if (photos.some(photo => !photo.type.startsWith('image/'))) return alert('Only image files can be uploaded.');
  const paths = [];
  for (const photo of photos) {
    const extension = photo.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${loggedInDealer.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabaseClient.storage.from('car-images').upload(path, photo, { contentType: photo.type, upsert: false });
    if (error) {
      if (paths.length) await supabaseClient.storage.from('car-images').remove(paths);
      return alert(`Could not upload car photo: ${error.message}`);
    }
    paths.push(path);
  }
  const profile = dealerProfiles.find(dealer => dealer.id === loggedInDealer.id);
  const imageUrl = supabaseClient.storage.from('car-images').getPublicUrl(paths[0]).data.publicUrl;
  const { data, error } = await supabaseClient.from('cars').insert({
    dealer_id: loggedInDealer.id,
    dealer_name: loggedInDealer.name,
    status: 'pending',
    make,
    model,
    year,
    price,
    condition: document.getElementById('cCond').value,
    color: 'Not specified',
    mileage: `${document.getElementById('cMile').value || '0'} km`,
    fuel: document.getElementById('cFuel').value,
    transmission: document.getElementById('cTrans').value,
    location: profile?.location || 'Nairobi',
    image_url: imageUrl,
    description: document.getElementById('cDesc').value.trim() || 'Contact the dealer for more information.'
  }).select('*').single();
  if (error) {
    await supabaseClient.storage.from('car-images').remove(paths);
    return alert(`Could not publish car: ${error.message}`);
  }
  const photoRows = paths.map(storage_path => ({ car_id: data.id, storage_path }));
  const { error: photoError } = await supabaseClient.from('car_photos').insert(photoRows);
  if (photoError) {
    await supabaseClient.from('cars').delete().eq('id', data.id);
    await supabaseClient.storage.from('car-images').remove(paths);
    return alert(`Could not save the car photos: ${photoError.message}`);
  }
  document.getElementById('addCarForm').classList.add('hidden');
  document.getElementById('cPhotos').value = '';
  await loadDealerCars(loggedInDealer.id);
  await loadDealerSales();
  renderDealerDashboard();
  alert('Your car has been submitted for admin review. It will appear publicly after approval.');
}

async function doLogin() {
  if (!supabaseClient) return alert('Supabase is not configured. Update supabase.js first.');
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPass').value;
  if (!email || !password) return alert('Enter your email and password.');
  const button = document.querySelector('#view-login button[onclick="doLogin()"]');
  if (button) button.disabled = true;
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert(`Sign-in failed: ${error.message}`);
    if (data.user?.app_metadata?.role === 'admin') {
      loggedInDealer = null;
      const loaded = await Promise.all([loadAdminDealerProfiles(), loadAllCars(), loadViewingRequests(), loadSales()]);
      if (loaded.some(result => !result)) alert('Signed in, but some dashboard data could not be loaded. Check the Supabase migration and RLS policies.');
      showView('admin');
      return;
    }
    const { data: dealer, error: dealerError } = await supabaseClient.from('dealers')
      .select('id, yard_name, email, phone, whatsapp_number, location').eq('id', data.user.id).maybeSingle();
    if (dealerError || !dealer) {
      await supabaseClient.auth.signOut();
      return alert('This account has no dealer profile. Ask an admin to register it.');
    }
    loggedInDealer = { id: dealer.id, name: dealer.yard_name, email: dealer.email };
    await Promise.all([loadDealerProfiles(), loadDealerCars(dealer.id), loadViewingRequests(), loadDealerSales()]);
    showView('dealer');
  } catch (error) {
    alert(`Unable to contact Supabase: ${error.message || 'Check your internet connection and try again.'}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function invokeAdmin(action, payload = {}) {
  const { data, error } = await supabaseClient.functions.invoke('admin-users', { body: { action, ...payload } });
  if (error) throw new Error(error.message || 'Admin operation failed.');
  if (data?.error) throw new Error(data.error);
  return data;
}

async function registerDealer() {
  const payload = {
    name: document.getElementById('dName').value.trim(),
    email: document.getElementById('dEmail').value.trim(),
    password: document.getElementById('dPass').value,
    phone: document.getElementById('dPhone').value.trim(),
    whatsapp: document.getElementById('dWhatsapp').value.trim(),
    location: document.getElementById('dLocation').value.trim()
  };
  if (Object.values(payload).some(value => !value)) return alert('Complete every dealer field.');
  try {
    await invokeAdmin('create-dealer', payload);
    ['dName', 'dEmail', 'dPass', 'dPhone', 'dWhatsapp', 'dLocation'].forEach(id => { document.getElementById(id).value = ''; });
    await loadAdminDealerProfiles();
    alert(`Dealer account created for ${payload.email}. Share the temporary password securely.`);
  } catch (error) {
    alert(error.message);
  }
}

async function registerAdmin() {
  const email = document.getElementById('aEmail').value.trim();
  const password = document.getElementById('aPass').value;
  if (!email || password.length < 8) return alert('Enter an email and a password of at least 8 characters.');
  try {
    await invokeAdmin('create-admin', { email, password });
    document.getElementById('aEmail').value = '';
    document.getElementById('aPass').value = '';
    alert(`Admin account created for ${email}.`);
  } catch (error) {
    alert(error.message);
  }
}

async function resetDealerPassword(dealerId, dealerName) {
  const password = prompt(`Enter a new temporary password for ${dealerName} (at least 8 characters):`);
  if (!password) return;
  if (password.length < 8) return alert('Password must be at least 8 characters.');
  try {
    await invokeAdmin('reset-password', { userId: dealerId, password });
    alert('Password updated. Share it securely with the dealer.');
  } catch (error) {
    alert(error.message);
  }
}

async function removeDealer(dealerId, dealerName) {
  if (!confirm(`Permanently remove ${dealerName}, their listings, photos, requests and sales?`)) return;
  try {
    await invokeAdmin('remove-dealer', { userId: dealerId });
    await Promise.all([loadAdminDealerProfiles(), loadAllCars(), loadViewingRequests(), loadSales()]);
    renderAdminDashboard();
  } catch (error) {
    alert(error.message);
  }
}

async function changeOwnPassword() {
  const password = document.getElementById('dealerNewPassword').value;
  if (password.length < 8) return alert('Choose a password of at least 8 characters.');
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) return alert(`Could not update password: ${error.message}`);
  document.getElementById('dealerNewPassword').value = '';
  alert('Password updated.');
}

async function logout() {
  await supabaseClient.auth.signOut();
  loggedInDealer = null;
  cars.splice(0);
  appointments = [];
  sales = [];
  await loadPublicCars();
  showView('home');
}

async function recordSale() {
  const carId = document.getElementById('saleCar').value;
  const amount = Number(document.getElementById('saleAmount').value);
  const saleDate = document.getElementById('saleDate').value;
  const car = cars.find(item => String(item.id) === carId);
  if (!car || !amount || !saleDate) return alert('Select a car, sale amount and sale date.');
  const { error } = await supabaseClient.from('sales').insert({
    dealer_id: loggedInDealer.id,
    car_id: car.id,
    amount,
    sale_date: saleDate,
    notes: document.getElementById('saleNotes').value.trim()
  });
  if (error) return alert(`Could not record sale: ${error.message}`);
  const { error: statusError } = await supabaseClient.from('cars').update({ status: 'sold' }).eq('id', car.id);
  if (statusError) console.warn('Sale saved, but listing status was not updated:', statusError.message);
  document.getElementById('saleAmount').value = '';
  document.getElementById('saleNotes').value = '';
  await Promise.all([loadDealerCars(loggedInDealer.id), loadDealerSales()]);
  renderDealerDashboard();
  alert('Sale recorded.');
}

async function loadDealerProfiles() {
  const { data, error } = await supabaseClient.rpc('get_public_dealer_contacts');
  if (error) return false;
  dealerContacts = data || [];
  return true;
}

async function loadAdminDealerProfiles() {
  const { data, error } = await supabaseClient.from('dealers').select('id, yard_name, email, phone, whatsapp_number, location, created_at').order('created_at', { ascending: false });
  if (error) {
    alert(`Could not load dealers: ${error.message}`);
    return false;
  }
  dealerProfiles = data || [];
  dealerContacts = dealerProfiles;
  renderAdminDashboard();
  return true;
}

async function loadPhotos(listings) {
  const ids = listings.map(car => car.id);
  if (!ids.length) return;
  const { data, error } = await supabaseClient.from('car_photos').select('id, car_id, storage_path').in('car_id', ids);
  if (error) {
    console.warn('Additional car photos could not be loaded:', error.message);
    return;
  }
  const photosByCar = new Map();
  (data || []).forEach(photo => {
    const list = photosByCar.get(photo.car_id) || [];
    list.push({ ...photo, url: supabaseClient.storage.from('car-images').getPublicUrl(photo.storage_path).data.publicUrl });
    photosByCar.set(photo.car_id, list);
  });
  listings.forEach(car => { car.photos = photosByCar.get(car.id) || []; });
}

async function loadPublicCars() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('cars')
    .select('id, dealer_id, dealer_name, make, model, year, price, condition, color, mileage, fuel, transmission, location, image_url, description, status')
    .eq('status', 'approved').order('created_at', { ascending: false });
  if (error) {
    console.warn('Car listings could not be loaded:', error.message);
    return;
  }
  cars.splice(0, cars.length, ...(data || []).map(mapDatabaseCar));
  await loadPhotos(cars);
  renderCars('carGrid', cars);
}

async function loadAllCars() {
  const { data, error } = await supabaseClient.from('cars')
    .select('id, dealer_id, dealer_name, make, model, year, price, condition, color, mileage, fuel, transmission, location, image_url, description, status')
    .order('created_at', { ascending: false });
  if (error) {
    alert(`Could not load listings: ${error.message}`);
    return false;
  }
  cars.splice(0, cars.length, ...(data || []).map(mapDatabaseCar));
  await loadPhotos(cars);
  renderAdminDashboard();
  return true;
}

async function loadDealerCars(dealerId) {
  const { data, error } = await supabaseClient.from('cars')
    .select('id, dealer_id, dealer_name, make, model, year, price, condition, color, mileage, fuel, transmission, location, image_url, description, status')
    .eq('dealer_id', dealerId).order('created_at', { ascending: false });
  if (error) {
    alert(`Could not load your listings: ${error.message}`);
    return false;
  }
  cars.splice(0, cars.length, ...(data || []).map(mapDatabaseCar));
  await loadPhotos(cars);
  return true;
}

async function loadViewingRequests() {
  const { data, error } = await supabaseClient.from('appointments')
    .select('id, dealer_id, car_id, car_title, buyer_name, buyer_phone, viewing_date, viewing_time, status')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('Viewing requests could not be loaded:', error.message);
    return false;
  }
  appointments = (data || []).map(row => ({ ...row, name: row.buyer_name, phone: row.buyer_phone, date: row.viewing_date, time: row.viewing_time }));
  return true;
}

async function loadSales() {
  const { data, error } = await supabaseClient.from('sales')
    .select('id, dealer_id, car_id, amount, sale_date, notes, dealers(yard_name), cars(make, model, year)')
    .order('sale_date', { ascending: false });
  if (error) {
    console.warn('Sales could not be loaded:', error.message);
    return false;
  }
  sales = data || [];
  return true;
}

async function loadDealerSales() {
  const { data, error } = await supabaseClient.from('sales')
    .select('id, dealer_id, car_id, amount, sale_date, notes, cars(make, model, year)')
    .eq('dealer_id', loggedInDealer.id).order('sale_date', { ascending: false });
  if (error) {
    console.warn('Your sales could not be loaded:', error.message);
    return false;
  }
  sales = data || [];
  return true;
}

function renderSalesRows(rows, adminMode) {
  return rows.map(sale => {
    const car = sale.cars || cars.find(item => item.id === sale.car_id);
    const title = car ? `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim() : 'Listing removed';
    return `<tr>${adminMode ? `<td>${escapeHtml(sale.dealers?.yard_name || 'Dealer')}</td>` : ''}<td>${escapeHtml(title)}</td><td>${formatPrice(sale.amount)}</td><td>${escapeHtml(sale.sale_date)}</td><td>${escapeHtml(sale.notes || '')}</td></tr>`;
  }).join('') || `<tr><td colspan="${adminMode ? 5 : 4}">No sales recorded yet.</td></tr>`;
}

function renderDealerDashboard() {
  if (!loggedInDealer) return;
  const ownCars = cars.filter(car => car.dealer_id === loggedInDealer.id);
  const ownAppointments = appointments.filter(item => item.dealer_id === loggedInDealer.id);
  document.getElementById('dealerName').textContent = `${loggedInDealer.name} Dashboard`;
  document.getElementById('dealerSub').textContent = loggedInDealer.email;
  document.getElementById('statCars').textContent = ownCars.length;
  document.getElementById('statAppt').textContent = ownAppointments.length;
  document.querySelector('#dealerCarsTable tbody').innerHTML = ownCars.map(car => `<tr><td>${escapeHtml(`${car.year} ${car.make} ${car.model}`)}</td><td>${formatPrice(car.price)}</td><td>${escapeHtml(car.condition)}</td><td><span class="pill ${car.status === 'approved' ? 'ok' : 'pend'}">${escapeHtml(car.status)}</span></td><td>${car.photos.length}</td><td>${appointments.filter(item => item.car_id === car.id).length}</td></tr>`).join('') || '<tr><td colspan="6">No listings yet.</td></tr>';
  document.querySelector('#dealerApptTable tbody').innerHTML = ownAppointments.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.car_title)}</td><td>${escapeHtml(`${item.date} ${item.time}`)}</td><td>${escapeHtml(item.phone)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('') || '<tr><td colspan="5">No viewing requests yet.</td></tr>';
  document.querySelector('#dealerSalesTable tbody').innerHTML = renderSalesRows(sales, false);
  const saleSelect = document.getElementById('saleCar');
  saleSelect.innerHTML = '<option value="">Select one of your cars</option>' + ownCars.filter(car => car.status === 'approved').map(car => `<option value="${escapeHtml(car.id)}">${escapeHtml(`${car.year} ${car.make} ${car.model}`)}</option>`).join('');
}

function renderAdminDashboard() {
  const pending = cars.filter(car => car.status === 'pending').length;
  document.getElementById('statAllDealers').textContent = dealerProfiles.length;
  document.getElementById('statAllCars').textContent = cars.length;
  document.getElementById('statAllAppt').textContent = appointments.length;
  document.getElementById('statPendingApprovals').textContent = pending;
  document.querySelector('#dealerTable tbody').innerHTML = dealerProfiles.map(dealer => `<tr><td>${escapeHtml(dealer.yard_name)}</td><td>${escapeHtml(dealer.email)}</td><td>${escapeHtml(dealer.phone)}</td><td>${escapeHtml(dealer.whatsapp_number)}</td><td>${escapeHtml(dealer.location || '')}</td><td>${cars.filter(car => car.dealer_id === dealer.id).length}</td><td><button class="btn btn-small btn-outline" onclick="resetDealerPassword('${escapeHtml(dealer.id)}','${escapeHtml(dealer.yard_name)}')">Reset password</button> <button class="btn btn-small btn-danger" onclick="removeDealer('${escapeHtml(dealer.id)}','${escapeHtml(dealer.yard_name)}')">Remove</button></td></tr>`).join('') || '<tr><td colspan="7">No dealers registered.</td></tr>';
  document.querySelector('#adminCarsTable tbody').innerHTML = cars.map(car => `<tr><td>${escapeHtml(`${car.year} ${car.make} ${car.model}`)}</td><td>${escapeHtml(car.dealer)}</td><td>${formatPrice(car.price)}</td><td><span class="pill ${car.status === 'approved' ? 'ok' : 'pend'}">${escapeHtml(car.status)}</span></td><td>${car.photos.map(photo => `<button class="photo-remove" type="button" title="Remove photo" onclick="removeCarPhoto('${escapeHtml(photo.id)}','${escapeHtml(car.id)}')"><img src="${escapeHtml(photo.url)}" alt="Remove photo"></button>`).join('') || 'No photos'}</td><td>${car.status === 'pending' ? `<button class="btn btn-small btn-green" onclick="setCarStatus('${escapeHtml(car.id)}','approved')">Approve</button> <button class="btn btn-small btn-danger" onclick="setCarStatus('${escapeHtml(car.id)}','rejected')">Reject</button>` : `<button class="btn btn-small btn-danger" onclick="deleteCar('${escapeHtml(car.id)}')">Remove listing</button>`}</td></tr>`).join('') || '<tr><td colspan="6">No car listings.</td></tr>';
  document.querySelector('#adminApptTable tbody').innerHTML = appointments.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.car_title)}</td><td>${escapeHtml(`${item.date} ${item.time}`)}</td><td>${escapeHtml(item.phone)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('') || '<tr><td colspan="5">No viewing requests yet.</td></tr>';
  const pendingCars = cars.filter(car => car.status === 'pending');
  document.querySelector('#adminApprovalTable tbody').innerHTML = pendingCars.map(car => `<tr><td>${escapeHtml(`${car.year} ${car.make} ${car.model}`)}</td><td>${escapeHtml(car.dealer)}</td><td>${formatPrice(car.price)}</td><td><button class="btn btn-small btn-green" onclick="setCarStatus('${escapeHtml(car.id)}','approved')">Approve</button> <button class="btn btn-small btn-danger" onclick="setCarStatus('${escapeHtml(car.id)}','rejected')">Reject</button></td></tr>`).join('') || '<tr><td colspan="4">No pending approvals.</td></tr>';
  document.querySelector('#adminSalesTable tbody').innerHTML = renderSalesRows(sales, true);
}

async function setCarStatus(carId, status) {
  const { error } = await supabaseClient.from('cars').update({ status }).eq('id', carId);
  if (error) return alert(`Could not update listing: ${error.message}`);
  const car = cars.find(item => String(item.id) === String(carId));
  if (car) car.status = status;
  renderAdminDashboard();
  renderCars('carGrid', cars.filter(item => item.status === 'approved'));
}

async function removeCarPhoto(photoId, carId) {
  if (!confirm('Permanently remove this posted photo?')) return;
  const { data: photo, error: readError } = await supabaseClient.from('car_photos').select('storage_path').eq('id', photoId).single();
  if (readError) return alert(`Could not find photo: ${readError.message}`);
  const { error: storageError } = await supabaseClient.storage.from('car-images').remove([photo.storage_path]);
  if (storageError) return alert(`Could not remove photo file: ${storageError.message}`);
  const { error } = await supabaseClient.from('car_photos').delete().eq('id', photoId);
  if (error) return alert(`Could not remove photo record: ${error.message}`);
  const car = cars.find(item => String(item.id) === String(carId));
  if (car) {
    car.photos = car.photos.filter(item => item.id !== photoId);
    const nextImage = car.photos[0]?.url || '';
    const { error: imageError } = await supabaseClient.from('cars').update({ image_url: nextImage }).eq('id', carId);
    if (imageError) console.warn('Photo was removed, but the listing image could not be refreshed:', imageError.message);
    car.image = nextImage;
  }
  renderAdminDashboard();
}

async function deleteCar(carId) {
  if (!confirm('Remove this listing and its uploaded photos?')) return;
  const car = cars.find(item => String(item.id) === String(carId));
  const paths = car?.photos.map(photo => photo.storage_path) || [];
  if (paths.length) {
    const { error } = await supabaseClient.storage.from('car-images').remove(paths);
    if (error) return alert(`Could not remove listing photos: ${error.message}`);
  }
  const { error } = await supabaseClient.from('cars').delete().eq('id', carId);
  if (error) return alert(`Could not remove listing: ${error.message}`);
  cars.splice(cars.indexOf(car), 1);
  await Promise.all([loadViewingRequests(), loadSales()]);
  renderAdminDashboard();
  renderCars('carGrid', cars.filter(item => item.status === 'approved'));
}

function focusAdminSection(id) {
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initializeApp() {
  document.getElementById('cMake').innerHTML = '<option value="">Select Make...</option>' + fallbackMakes.map(make => `<option value="${make}">${make}</option>`).join('');
  document.querySelector('.searchbar button').onclick = searchFromHero;
  document.querySelector('.actions .btn-wa').onclick = () => contactDealer('whatsapp');
  document.querySelector('.actions .btn-outline').onclick = () => contactDealer('phone');
  document.getElementById('carModal').addEventListener('click', event => { if (event.target.id === 'carModal') closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  showSetupMessage();
  renderCars('carGrid', []);
  if (supabaseClient) {
    loadDealerProfiles();
    loadPublicCars();
  }
}

initializeApp();
