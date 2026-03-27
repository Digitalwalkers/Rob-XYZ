import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/upload', form);
  return data;
}

export function subscribeProgress(taskId, onEvent, onDone) {
  const es = new EventSource(`/api/upload/${taskId}/progress`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    onEvent(data);
    if (data.status === 'completed' || data.status === 'error') {
      es.close();
      onDone();
    }
  };
  es.onerror = () => {
    es.close();
    onDone();
  };
  return () => es.close();
}

export async function getFiles() {
  const { data } = await api.get('/files');
  return data;
}

export async function deleteFile(id) {
  await api.delete(`/files/${id}`);
}

export async function getUploads() {
  const { data } = await api.get('/uploads');
  return data;
}

export async function getFileRobots(fileId) {
  const { data } = await api.get(`/files/${fileId}/robots`);
  return data;
}

export async function getFileTimeRange(fileId, robotIds) {
  const params = {};
  if (robotIds && robotIds.length > 0) {
    params.robot_ids = robotIds.join(',');
  }
  const { data } = await api.get(`/files/${fileId}/time-range`, { params });
  return data;
}

export async function getFeatureRegistry() {
  const { data } = await api.get('/features/registry');
  return data;
}

export async function getFeatureStatus(fileId) {
  const { data } = await api.get(`/files/${fileId}/features/status`);
  return data;
}

export async function getFeatureData(fileId, { featureKeys, robotIds } = {}) {
  const params = {};
  if (featureKeys && featureKeys.length > 0) params.feature_keys = featureKeys.join(',');
  if (robotIds && robotIds.length > 0) params.robot_ids = robotIds.join(',');
  const { data } = await api.get(`/files/${fileId}/features/data`, { params });
  return data;
}

export async function computeFeatures(fileId) {
  const { data } = await api.post(`/files/${fileId}/features/compute`);
  return data;
}

export function subscribeFeatureProgress(fileId, onEvent, onDone) {
  const es = new EventSource(`/api/files/${fileId}/features/progress`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    onEvent(data);
    if (data.status === 'completed' || data.status === 'error') {
      es.close();
      onDone?.();
    }
  };
  es.onerror = () => {
    es.close();
    onDone?.();
  };
  return () => es.close();
}

export async function getFileData(fileId, { robotIds, start, end, sampleInterval, signal } = {}) {
  const params = {};
  if (robotIds && robotIds.length > 0) params.robot_ids = robotIds.join(',');
  if (start) params.start = start;
  if (end) params.end = end;
  if (sampleInterval && sampleInterval > 1) params.sample_interval = sampleInterval;
  const { data } = await api.get(`/files/${fileId}/data`, { params, signal });
  return data;
}
