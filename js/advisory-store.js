import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app);
const docRef = doc(db, "advisories", "workflow");

const LOCAL_STORAGE_KEY = 'toursensi_advisory_workflow_v1';

export async function loadAdvisoryWorkflow() {
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = normalizeWorkflow(snap.data());
      // Sync to localStorage as a fallback backup
      saveLocal(data);
      return data;
    }
  } catch (e) {
    console.warn("[advisory-store] Firebase load failed, falling back to localStorage", e);
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
  workflow.approved = {
    ...advisory,
    id: advisory.id || createId(),
    status: 'approved',
    publishedAt: new Date().toISOString(),
  };
  await saveWorkflow(workflow);
  return workflow;
}

export async function approvePendingAdvisory(id) {
  const workflow = await loadAdvisoryWorkflow();
  const match = workflow.pending.find((item) => item.id === id);
  if (!match) return workflow;

  workflow.approved = {
    ...match,
    status: 'approved',
    publishedAt: new Date().toISOString(),
  };
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
    await setDoc(docRef, data);
  } catch (e) {
    console.error("[advisory-store] Firebase save failed", e);
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
  return {
    approved: data?.approved || null,
    pending: Array.isArray(data?.pending) ? data.pending : [],
  };
}

function emptyWorkflow() {
  return { approved: null, pending: [] };
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `adv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
