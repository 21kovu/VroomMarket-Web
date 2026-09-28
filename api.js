// js/api.js

// Base URL for the free CarAPI
const CAR_API_BASE = 'https://carapi.app/api';

// Global variables to store fetched data
let carMakes = [];
let carModels = [];

// Fetch all available car makes from CarAPI
async function fetchCarMakes() {
    try {
        const response = await fetch(`${CAR_API_BASE}/makes`);
        if (!response.ok) throw new Error('Failed to fetch makes');
        
        const data = await response.json();
        carMakes = data.data; // CarAPI returns data inside a `data` property
        
        // Populate the Make dropdown
        const makeSelect = document.getElementById('cMake');
        if (makeSelect) {
            makeSelect.innerHTML = '<option value="">Select Make...</option>' + 
                carMakes.map(make => `<option value="${make.id}">${make.name}</option>`).join('');
        }
    } catch (error) {
        console.error('Error fetching car makes:', error);
        // Fallback if API fails
        const makeSelect = document.getElementById('cMake');
        if (makeSelect) {
            makeSelect.innerHTML = '<option value="">Select Make...</option><option value="1">Toyota</option><option value="2">Honda</option>';
        }
    }
}

// Fetch models for a specific make
async function loadModels() {
    const makeId = document.getElementById('cMake').value;
    const modelSelect = document.getElementById('cModel');
    
    if (!makeId) {
        modelSelect.innerHTML = '<option value="">Select Model...</option>';
        return;
    }

    try {
        const response = await fetch(`${CAR_API_BASE}/models?make_id=${makeId}`);
        if (!response.ok) throw new Error('Failed to fetch models');
        
        const data = await response.json();
        carModels = data.data;

        modelSelect.innerHTML = '<option value="">Select Model...</option>' + 
            carModels.map(model => `<option value="${model.name}">${model.name}</option>`).join('');
    } catch (error) {
        console.error('Error fetching car models:', error);
        modelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
}

// Fetch a random placeholder image from Unsplash based on the car make
function getCarImage(make) {
    // In a real app, you would upload actual photos to Supabase Storage.
    // For now, we use a generic high-quality image.
    return 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800';
}