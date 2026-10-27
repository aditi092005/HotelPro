import { Spinner } from 'react-bootstrap';

export default function Loading({ label = 'Loading...', full = false }) {
  return (
    <div className={`d-flex flex-column align-items-center justify-content-center text-muted py-5 ${full ? 'min-vh-100' : ''}`} role="status">
      <Spinner animation="border" variant="warning" />
      <small className="mt-2">{label}</small>
    </div>
  );
}
