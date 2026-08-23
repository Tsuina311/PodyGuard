import { EventStatus } from '@poderate/shared';
import { Link, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <div className="app">
      <header className="hero">
        <p className="brand">Poderate</p>
        <h1>Casual multiplayer matchmaking</h1>
        <p className="lede">
          Live queue for physical tabletop events. Foundation build — Phase 0.
        </p>
        <p className="meta">
          Shared event status sample: <code>{EventStatus.Open}</code>
        </p>
        <nav>
          <Link to="/">Home</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={null} />
        <Route path="/e/:joinCode" element={<JoinPlaceholder />} />
      </Routes>
    </div>
  );
}

function JoinPlaceholder() {
  return (
    <p className="note">
      Event join flow arrives in Phase 1. QR codes will target{' '}
      <code>#/e/JOINCODE</code>.
    </p>
  );
}
