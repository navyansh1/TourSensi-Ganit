const STORAGE_KEY = 'toursensi_advisory_workflow_v1';

export function loadAdvisoryWorkflow() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkflow();
    const data = JSON.parse(raw);
    return normalizeWorkflow(data);
  } catch {
    return emptyWorkflow();
  }
}

export function queuePendingAdvisory(advisory) {
  const workflow = loadAdvisoryWorkflow();
  workflow.pending.unshift({
    ...advisory,
    id: advisory.id || createId(),
    status: 'pending',
    submittedAt: advisory.submittedAt || new Date().toISOString(),
  });
  saveWorkflow(workflow);
  return workflow;
}

export function publishApprovedAdvisory(advisory) {
  const workflow = loadAdvisoryWorkflow();
  workflow.approved = {
    ...advisory,
    id: advisory.id || createId(),
    status: 'approved',
    publishedAt: new Date().toISOString(),
  };
  saveWorkflow(workflow);
  return workflow;
}

export function approvePendingAdvisory(id) {
  const workflow = loadAdvisoryWorkflow();
  const match = workflow.pending.find((item) => item.id === id);
  if (!match) return workflow;

  workflow.approved = {
    ...match,
    status: 'approved',
    publishedAt: new Date().toISOString(),
  };
  workflow.pending = workflow.pending.filter((item) => item.id !== id);
  saveWorkflow(workflow);
  return workflow;
}

export function rejectPendingAdvisory(id) {
  const workflow = loadAdvisoryWorkflow();
  workflow.pending = workflow.pending.filter((item) => item.id !== id);
  saveWorkflow(workflow);
  return workflow;
}

function saveWorkflow(workflow) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWorkflow(workflow)));
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
