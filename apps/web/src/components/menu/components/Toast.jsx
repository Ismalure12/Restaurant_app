'use client';

import { useMenu } from '../MenuContext';

// Transient confirmation toast (e.g. "X added").
export default function Toast() {
  const { toastMsg } = useMenu();
  return <div className={`toast ${toastMsg ? 'show' : ''}`}>{toastMsg || 'Added'}</div>;
}
