import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBltgbG4xczbNdaxlJGrjMRU6J8dPGohOI",
  authDomain: "toursensi-ganit.firebaseapp.com",
  projectId: "toursensi-ganit",
  storageBucket: "toursensi-ganit.firebasestorage.app",
  messagingSenderId: "1043300385519",
  appId: "1:1043300385519:web:2b91908bea36442843111a",
  measurementId: "G-WYV39ZN82T"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dbRef = ref(db, "advisories/workflow");

const LOCAL_STORAGE_KEY = 'toursensi_advisory_workflow_v1';

export function subscribeToAdvisoryWorkflow(callback) {
  try {
    return onValue(dbRef, (snap) => {
      if (snap.exists()) {
        const data = normalizeWorkflow(snap.val());
        saveLocal(data);
        callback(data);
      } else {
        const data = emptyWorkflow();
        saveLocal(data);
        callback(data);
      }
    }, (error) => {
      console.warn("[advisory-store] Firebase Realtime DB subscription error", error);
    });
  } catch (e) {
    console.warn("[advisory-store] Firebase Realtime DB subscribe failed", e);
    // Fallback immediately with local storage data
    callback(loadLocal());
    return () => {}; // return empty unsubscribe
  }
}

export async function loadAdvisoryWorkflow() {
  try {
    const snap = await get(dbRef);
    if (snap.exists()) {
      const data = normalizeWorkflow(snap.val());
      // Sync to localStorage as a fallback backup
      saveLocal(data);
      return data;
    }
  } catch (e) {
    console.warn("[advisory-store] Firebase Realtime DB load failed, falling back to localStorage", e);
  }
  return loadLocal();
}

export async function queuePendingAdvisory(advisory) {
  const workflow = await loadAdvisoryWorkflow();
  workflow.pending.unshift({
    ...advisory,
    id: advisory.id || createId(),
    status: 'pending',
    submittedAt: advisory.submittedAt || new Date().toISOString(),
  });
  await saveWorkflow(workflow);
  return workflow;
}

export async function publishApprovedAdvisory(advisory) {
  const workflow = await loadAdvisoryWorkflow();
  const approvedList = Array.isArray(workflow.approved) ? workflow.approved : [];

  const newApproved = {
    ...advisory,
    id: advisory.id || createId(),
    status: 'approved',
    publishedAt: new Date().toISOString(),
  };

  // Filter out any existing approved advisory for the same placeLabel
  workflow.approved = approvedList.filter((item) => item.placeLabel !== advisory.placeLabel);
  workflow.approved.push(newApproved);

  await saveWorkflow(workflow);
  return workflow;
}

export async function approvePendingAdvisory(id) {
  const workflow = await loadAdvisoryWorkflow();
  const match = workflow.pending.find((item) => item.id === id);
  if (!match) return workflow;

  const approvedList = Array.isArray(workflow.approved) ? workflow.approved : [];

  const newApproved = {
    ...match,
    status: 'approved',
    publishedAt: new Date().toISOString(),
  };

  // Filter out any existing approved advisory for the same placeLabel
  workflow.approved = approvedList.filter((item) => item.placeLabel !== match.placeLabel);
  workflow.approved.push(newApproved);

  workflow.pending = workflow.pending.filter((item) => item.id !== id);
  await saveWorkflow(workflow);
  return workflow;
}

export async function rejectPendingAdvisory(id) {
  const workflow = await loadAdvisoryWorkflow();
  workflow.pending = workflow.pending.filter((item) => item.id !== id);
  await saveWorkflow(workflow);
  return workflow;
}

async function saveWorkflow(workflow) {
  const data = normalizeWorkflow(workflow);
  saveLocal(data);
  try {
    await set(dbRef, data);
  } catch (e) {
    console.error("[advisory-store] Firebase Realtime DB save failed", e);
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return emptyWorkflow();
    return normalizeWorkflow(JSON.parse(raw));
  } catch {
    return emptyWorkflow();
  }
}

function saveLocal(workflow) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(workflow));
  } catch (e) {
    console.warn("[advisory-store] Local save failed", e);
  }
}

function normalizeWorkflow(data) {
  let approvedList = [];
  if (Array.isArray(data?.approved)) {
    approvedList = data.approved;
  } else if (data?.approved && typeof data.approved === 'object') {
    approvedList = [data.approved];
  }
  return {
    approved: approvedList,
    pending: Array.isArray(data?.pending) ? data.pending : [],
  };
}

function emptyWorkflow() {
  return { approved: [], pending: [] };
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `adv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
